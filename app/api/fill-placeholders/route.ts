import { type NextRequest, NextResponse } from "next/server"
import { streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"

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
    if (provider === "openai") {
      const openai = createOpenAI({ apiKey })
      model = openai("gpt-4o")
    } else {
      const xai = createXai({ 
        apiKey,
        timeout: 120000, // 2분 타임아웃 (reasoning 모델용)
      })
      // Grok 최신 모델: grok-4
      model = xai("grok-4")
    }

    // placeholders는 이제 {key, description} 객체 배열
    type PlaceholderInput = { key: string; description?: string }
    const placeholderList = placeholders as PlaceholderInput[]
    
    // description이 있는 경우 프롬프트에 반영
    const placeholderDescriptions = placeholderList
      .map((p) => {
        if (p.description) {
          return `- {{${p.key}}} : ${p.description}`
        }
        return `- {{${p.key}}}`
      })
      .join("\n")

    const prompt = `You are a document filling assistant. I have a document with the following placeholders that need to be filled:

${placeholderDescriptions}

Here is the data content:
${dataContent}

Please analyze the data content and provide appropriate values for each placeholder. If a placeholder has a description (after the colon), follow those instructions carefully when generating the value. 

IMPORTANT: Return ONLY a JSON object with placeholder names (WITHOUT curly braces) as keys and their values. Do not include {{}} in the keys. Do not include any other text or explanation.

Example format:
{
  "name": "John Doe",
  "date": "2024-01-15",
  "company": "Acme Corp"
}

NOT like this (wrong):
{
  "{{name}}": "John Doe"
}`

    console.log("[v0] 생성된 프롬프트:")
    console.log(prompt)
    console.log("\n[v0] AI 모델:", provider === "openai" ? "gpt-4o" : "grok-4")

    const result = await streamText({
      model,
      prompt,
      temperature: 0.7,
    })

    // Stream을 텍스트로 변환
    let fullText = ""
    for await (const textPart of result.textStream) {
      fullText += textPart
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
    const normalizedData: Record<string, string> = {}
    for (const [key, value] of Object.entries(filledData)) {
      // {{key}} -> key 형식으로 변환
      const normalizedKey = key.replace(/^\{\{|\}\}$/g, '')
      normalizedData[normalizedKey] = value as string
    }
    
    console.log("[v0] 정규화된 데이터:", normalizedData)
    
    const filledPlaceholders = placeholderList.map((p) => ({
      key: p.key,
      value: normalizedData[p.key] || "",
      ...(p.description && { description: p.description }),
    }))

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
