import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createXai } from "@ai-sdk/xai"
import { streamText } from "ai"

export async function POST(req: NextRequest) {
  try {
    const { dataContent, placeholders, provider, apiKey } = await req.json()

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

    // placeholders는 이제 {key, description, isLoop, fields} 객체 배열
    type PlaceholderInput = { key: string; description?: string; isLoop?: boolean; fields?: string[] }
    const placeholderList = placeholders as PlaceholderInput[]

    // description이 있는 경우 프롬프트에 반영, 루프 태그 및 필드 정보 표시
    const placeholderDescriptions = placeholderList
      .map((p) => {
        if (p.isLoop) {
          const fieldsStr = p.fields && p.fields.length > 0 ? ` (Fields: ${p.fields.join(', ')})` : ''
          const prefix = `- {{#${p.key}}} [ARRAY/LIST]${fieldsStr}`
          return p.description ? `${prefix} : ${p.description}` : prefix
        }

        const prefix = `- {{${p.key}}}`
        return p.description ? `${prefix} : ${p.description}` : prefix
      })
      .join("\n")

    const prompt = `You are a document filling assistant. I have a document with the following placeholders that need to be filled:
 
 ${placeholderDescriptions}
 
 Here is the data content:
 ${dataContent}
 
 Please analyze the data content and provide appropriate values for each placeholder. If a placeholder has a description (after the colon), follow those instructions carefully when generating the value. 
 
 IMPORTANT: Return ONLY a JSON object with placeholder names as keys and their values. 
 
 - For normal placeholders, provide STRING values.
 - For [ARRAY/LIST] placeholders, provide a JSON ARRAY of objects. Each object should contain the requested "Fields" if they were specified.
 - If no specific fields were specified for an array, create appropriate field names based on the data.
 - Do not include any other text or explanation.
 
 Example format:
 {
   "company": "Acme Corp",
   "tasks": [
     { "no": "1", "name": "Design", "owner": "John" },
     { "no": "2", "name": "Build", "owner": "Sarah" }
   ]
 }`

    let fullText = ""

    if (useResponsesAPI) {
      // OpenAI GPT-5 - Responses API 사용
      const result = await (model as OpenAI).responses.create({
        model: "gpt-5.2",
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

    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response")
    }

    const filledData = JSON.parse(jsonMatch[0])

    // AI가 {{key}} 형식으로 반환했을 수 있으므로 정규화
    const normalizedData: Record<string, any> = {}
    for (const [key, value] of Object.entries(filledData)) {
      // {{key}} -> key 형식으로 변환
      const normalizedKey = key.replace(/^\{\{|\}\}$|^\#|\/$/g, '')
      normalizedData[normalizedKey] = value
    }

    console.log("[v0] 정규화된 데이터:", normalizedData)

    const filledPlaceholders = placeholderList.map((p) => {
      const value = normalizedData[p.key]
      return {
        key: p.key,
        value: value || (p.isLoop ? [] : ""),
        ...(p.description && { description: p.description }),
        ...(p.isLoop && { isLoop: true, fields: p.fields })
      }
    })

    return NextResponse.json({ filledPlaceholders })
  } catch (error: any) {
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
