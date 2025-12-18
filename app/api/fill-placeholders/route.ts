import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createXai } from "@ai-sdk/xai"
import { streamText } from "ai"

export async function POST(req: NextRequest) {
  try {
    const { dataContent, placeholders, provider, apiKey } = await req.json()

    console.log("[v0] 받은 데이터:")
    console.log("- dataContent 길이:", dataContent?.length || 0)
    console.log("- placeholders:", JSON.stringify(placeholders, null, 2))
    console.log("- provider:", provider)

    if (!apiKey) {
      return NextResponse.json(
        { error: `Please configure your ${provider === "openai" ? "OpenAI" : "Grok"} API key in settings` },
        { status: 400 },
      )
    }

    let model
    let useResponsesAPI = false
    if (provider === "openai") {
      // OpenAI GPT-5 - Responses API 사용
      useResponsesAPI = true
      model = new OpenAI({ apiKey })
    } else {
      const xai = createXai({
        apiKey,
        timeout: 120000,
      })
      // Grok 빠른 non-reasoning 모델
      model = xai("grok-4-fast-non-reasoning")
    }

    // placeholders는 이제 {key, description, isLoop} 객체 배열
    type PlaceholderInput = { key: string; description?: string; isLoop?: boolean }
    const placeholderList = placeholders as PlaceholderInput[]

    // description이 있는 경우 프롬프트에 반영, 루프 태그 표시
    const placeholderDescriptions = placeholderList
      .map((p) => {
        const prefix = p.isLoop ? `- {{#${p.key}}} [TABLE/ARRAY]` : `- {{${p.key}}}`
        if (p.description) {
          return `${prefix} : ${p.description}`
        }
        return prefix
      })
      .join("\n")

    const prompt = `You are a document filling assistant. I have a document with the following placeholders that need to be filled:

${placeholderDescriptions}

Here is the data content:
${dataContent}

Please analyze the data content and provide appropriate values for each placeholder. If a placeholder has a description (after the colon), follow those instructions carefully when generating the value. 

IMPORTANT: Return ONLY a JSON object with placeholder names (WITHOUT curly braces or # symbols) as keys and their values. 

- For simple placeholders, provide STRING values
- For table/array placeholders (descriptions mentioning "table", "list"), provide a MARKDOWN TABLE STRING
- Do not include {{}} or {#} or {/} in the keys
- Do not include any other text or explanation

Example format for simple placeholders:
{
  "name": "John Doe",
  "date": "2024-01-15",
  "company": "Acme Corp"
}

Format for table placeholders - USE MARKDOWN TABLE:
The markdown table will be inserted directly into the Word document.`

    console.log("[v0] 생성된 프롬프트:")
    console.log(prompt)
    console.log("\n[v0] AI 모델:", provider === "openai" ? "gpt-5.2" : "grok-4-fast-non-reasoning")

    let fullText = ""

    if (useResponsesAPI) {
      // OpenAI GPT-5 - Responses API 사용
      const result = await (model as OpenAI).responses.create({
        model: "gpt-5",
        input: prompt,
        reasoning: { effort: "low" },  // 빠른 응답, instruction following에 최적
        text: { verbosity: "medium" }
      })
      fullText = result.output_text
    } else {
      // Grok - 기존 AI SDK 사용
      const result = await streamText({
        model: model as any,
        prompt,
        temperature: 0.7,
      })

      // Stream을 텍스트로 변환
      for await (const textPart of result.textStream) {
        fullText += textPart
      }
    }

    console.log("[v0] AI 응답:")
    console.log(fullText)

    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error("[v0] JSON 파싱 실패 - AI 응답:", fullText)
      throw new Error("Failed to parse AI response")
    }

    const filledData = JSON.parse(jsonMatch[0])
    console.log("[v0] 파싱된 데이터:", filledData)

    // AI가 {{key}} 형식으로 반환했을 수 있으므로 정규화
    const normalizedData: Record<string, any> = {}
    for (const [key, value] of Object.entries(filledData)) {
      // {{key}} -> key 형식으로 변환
      const normalizedKey = key.replace(/^\{\{|\}\}$/g, '')
      normalizedData[normalizedKey] = value
    }

    console.log("[v0] 정규화된 데이터:", normalizedData)

    const filledPlaceholders = placeholderList.map((p) => {
      const value = normalizedData[p.key]
      return {
        key: p.key,
        // 모든 값을 문자열로 (AI가 마크다운 표를 문자열로 반환함)
        value: value?.toString() || "",
        ...(p.description && { description: p.description }),
      }
    })

    console.log("[v0] 최종 결과:", JSON.stringify(filledPlaceholders, null, 2))

    return NextResponse.json({ filledPlaceholders })
  } catch (error: any) {
    console.error("[v0] Error filling placeholders:", error)

    // API 키 오류 체크
    if (error?.responseBody?.includes('Incorrect API key') || error?.responseBody?.includes('invalid_api_key')) {
      return NextResponse.json(
        { error: `API 키가 올바르지 않습니다. Settings에서 ${provider === "openai" ? "OpenAI" : "Grok"} API 키를 확인해주세요.` },
        { status: 401 },
      )
    }

    // 일반 에러 메시지
    let errorMessage = "Failed to fill placeholders"
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (error?.responseBody) {
      try {
        const errorData = JSON.parse(error.responseBody)
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        errorMessage = error.responseBody
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: error?.statusCode || 500 },
    )
  }
}
