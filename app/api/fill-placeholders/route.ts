import { type NextRequest, NextResponse } from "next/server"
import OpenAI, { toFile } from "openai"
import { createXai } from "@ai-sdk/xai"
import { streamText } from "ai"

type PlaceholderInput = { key: string; description?: string; isLoop?: boolean; fields?: string[] }
type FileSearchEvidence = {
  toolCallId: string
  queries: string[]
  fileId: string | null
  filename: string | null
  score: number | null
  text: string
}

function buildPlaceholderDescriptions(placeholderList: PlaceholderInput[]) {
  return placeholderList
    .map((p) => {
      if (p.isLoop) {
        const fieldsStr = p.fields && p.fields.length > 0 ? ` (Fields: ${p.fields.join(", ")})` : ""
        const prefix = `- {{#${p.key}}} [ARRAY/LIST]${fieldsStr}`
        return p.description ? `${prefix} : ${p.description}` : prefix
      }

      const prefix = `- {{${p.key}}}`
      return p.description ? `${prefix} : ${p.description}` : prefix
    })
    .join("\n")
}

function buildPrompt({
  placeholderDescriptions,
  dataContent,
  withInlineContent,
}: {
  placeholderDescriptions: string
  dataContent?: string
  withInlineContent: boolean
}) {
  const dataSection = withInlineContent
    ? `\nHere is the data content:\n${dataContent ?? ""}\n`
    : "\nUse file_search tool results as the source of truth for filling placeholders.\n"

  return `You are a document filling assistant. I have a document with the following placeholders that need to be filled:
 
${placeholderDescriptions}
${dataSection}
Please analyze the source data and provide appropriate values for each placeholder. If a placeholder has a description (after the colon), follow those instructions carefully when generating the value.
 
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
}

function extractFileSearchEvidence(response: OpenAI.Responses.Response): FileSearchEvidence[] {
  const evidence: FileSearchEvidence[] = []
  for (const item of response.output) {
    if (item.type !== "file_search_call") continue

    for (const result of item.results ?? []) {
      if (!result.text) continue
      evidence.push({
        toolCallId: item.id,
        queries: item.queries ?? [],
        fileId: result.file_id ?? null,
        filename: result.filename ?? null,
        score: typeof result.score === "number" ? result.score : null,
        text: result.text,
      })
    }
  }
  return evidence
}

export async function POST(req: NextRequest) {
  let provider: "openai" | "grok" = "openai"

  try {
    const { dataContent, placeholders, provider: requestProvider, apiKey } = await req.json()
    provider = requestProvider === "grok" ? "grok" : "openai"

    if (!apiKey) {
      return NextResponse.json(
        { error: `Please configure your ${provider === "openai" ? "OpenAI" : "Grok"} API key in settings` },
        { status: 400 },
      )
    }
    if (typeof dataContent !== "string" || dataContent.trim().length === 0) {
      return NextResponse.json(
        { error: "데이터 파일 내용이 비어있습니다. 최소 1개 이상의 유효한 파일을 업로드해주세요." },
        { status: 400 },
      )
    }
    if (!Array.isArray(placeholders)) {
      return NextResponse.json(
        { error: "플레이스홀더 형식이 올바르지 않습니다." },
        { status: 400 },
      )
    }

    let model
    let openaiClient: OpenAI | null = null
    if (provider === "openai") {
      openaiClient = new OpenAI({ apiKey })
    } else {
      const xai = createXai({ apiKey })
      // Grok 빠른 non-reasoning 모델
      model = xai("grok-4-fast-non-reasoning")
    }

    const placeholderList = placeholders as PlaceholderInput[]
    const placeholderDescriptions = buildPlaceholderDescriptions(placeholderList)

    let fullText = ""
    let evidence: FileSearchEvidence[] = []

    if (openaiClient) {
      const prompt = buildPrompt({ placeholderDescriptions, withInlineContent: false })
      let uploadedFileId: string | null = null
      let vectorStoreId: string | null = null

      try {
        const file = await toFile(Buffer.from(dataContent, "utf-8"), `repgen-${Date.now()}.txt`, {
          type: "text/plain",
        })

        const uploaded = await openaiClient.files.create({
          file,
          purpose: "assistants",
        })
        uploadedFileId = uploaded.id

        // NOTE: SDK type currently supports "days" granularity. We additionally clean up right away.
        const vectorStore = await openaiClient.vectorStores.create({
          name: `repgen-${Date.now()}`,
          expires_after: { anchor: "last_active_at", days: 1 },
        })
        vectorStoreId = vectorStore.id

        await openaiClient.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
          file_ids: [uploadedFileId],
        })

        const result = await openaiClient.responses.create({
          model: "gpt-5.2",
          input: prompt,
          include: ["file_search_call.results"],
          tools: [
            {
              type: "file_search",
              vector_store_ids: [vectorStoreId],
              max_num_results: 20,
            },
          ],
          tool_choice: "required",
          reasoning: { effort: "medium" },
          max_output_tokens: 16000,
        })
        fullText = result.output_text
        evidence = extractFileSearchEvidence(result)
      } catch (fileSearchError: any) {
        console.error("[v0] file_search 실패, inline prompt fallback 실행:", fileSearchError)

        // Fallback: file_search 실패 시 기존 inline 방식으로 1회 재시도
        const fallbackPrompt = buildPrompt({
          placeholderDescriptions,
          dataContent,
          withInlineContent: true,
        })
        const fallbackResult = await openaiClient.responses.create({
          model: "gpt-5.2",
          input: fallbackPrompt,
          reasoning: { effort: "medium" },
          max_output_tokens: 16000,
        })
        fullText = fallbackResult.output_text
      } finally {
        if (vectorStoreId) {
          try {
            await openaiClient.vectorStores.del(vectorStoreId)
          } catch (cleanupError) {
            console.error("[v0] vector store cleanup 실패:", cleanupError)
          }
        }
        if (uploadedFileId) {
          try {
            await openaiClient.files.del(uploadedFileId)
          } catch (cleanupError) {
            console.error("[v0] uploaded file cleanup 실패:", cleanupError)
          }
        }
      }
    } else {
      // Grok - 기존 AI SDK 사용
      const prompt = buildPrompt({
        placeholderDescriptions,
        dataContent,
        withInlineContent: true,
      })
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

    const filledPlaceholders = placeholderList.map((p) => {
      const value = normalizedData[p.key]
      return {
        key: p.key,
        value: value ?? (p.isLoop ? [] : ""),
        ...(p.description && { description: p.description }),
        ...(p.isLoop && { isLoop: true, fields: p.fields })
      }
    })

    return NextResponse.json({
      filledPlaceholders,
      evidence: evidence.length > 0 ? evidence : undefined,
    })
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
