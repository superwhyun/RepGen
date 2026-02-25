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

type DeleteRetryResult = {
  ok: boolean
  attempts: number
  error?: string
}

type ProcessingMeta = {
  provider: "openai" | "grok"
  usedFileSearch: boolean
  usedFallback: boolean
  fallbackReason?: string
  parsingMode: "structured_json_schema" | "json_extractor"
  cleanup?: {
    vectorStoreDeleted: boolean
    vectorStoreDeleteAttempts: number
    uploadedFileDeleted: boolean
    uploadedFileDeleteAttempts: number
  }
}

const JSON_EXAMPLE = {
  company: "Acme Corp",
  tasks: [
    { no: "1", name: "Design", owner: "John" },
    { no: "2", name: "Build", owner: "Sarah" },
  ],
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
- Do not include any other text or explanation.
 
Example format:
${JSON.stringify(JSON_EXAMPLE, null, 2)}`
}

function buildStructuredOutputSchema(placeholderList: PlaceholderInput[]) {
  const properties: Record<string, unknown> = {}
  for (const p of placeholderList) {
    if (p.isLoop) {
      const fields = p.fields ?? []
      if (fields.length === 0) {
        throw new Error(`Strict schema 생성 실패: 루프 "${p.key}" 필드가 비어있습니다.`)
      }

      const itemProperties = Object.fromEntries(fields.map((field) => [field, { type: "string" }]))
      properties[p.key] = {
        type: "array",
        items: {
          type: "object",
          properties: itemProperties,
          required: fields,
          additionalProperties: false,
        },
      }
    } else {
      properties[p.key] = { type: "string" }
    }
  }

  return {
    type: "object",
    properties,
    required: placeholderList.map((p) => p.key),
    additionalProperties: false,
  } as const
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

function extractJsonObject(text: string) {
  const trimmed = text.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // Ignore and try object boundary extraction below.
  }

  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === "\\") {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === "{") {
      if (start === -1) start = i
      depth += 1
      continue
    }

    if (ch === "}") {
      depth -= 1
      if (depth === 0 && start !== -1) {
        const candidate = trimmed.slice(start, i + 1)
        return JSON.parse(candidate)
      }
    }
  }

  throw new Error("Failed to parse AI response as JSON")
}

function normalizeFilledData(filledData: Record<string, any>) {
  const normalizedData: Record<string, any> = {}
  for (const [key, value] of Object.entries(filledData)) {
    const normalizedKey = key.replace(/^\{\{|\}\}$|^\#|\/$/g, "")
    normalizedData[normalizedKey] = value
  }
  return normalizedData
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryWithBackoff(action: () => Promise<void>, label: string): Promise<DeleteRetryResult> {
  const delays = [0, 300, 900]

  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await sleep(delays[i])
    }

    try {
      await action()
      return { ok: true, attempts: i + 1 }
    } catch (error: any) {
      if (i === delays.length - 1) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[v0] ${label} cleanup 실패:`, error)
        return { ok: false, attempts: i + 1, error: errorMessage }
      }
    }
  }

  return { ok: false, attempts: delays.length, error: "Unknown cleanup error" }
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
      model = xai("grok-4-fast-non-reasoning")
    }

    const placeholderList = placeholders as PlaceholderInput[]
    const placeholderDescriptions = buildPlaceholderDescriptions(placeholderList)
    const outputSchema = buildStructuredOutputSchema(placeholderList)

    let fullText = ""
    let evidence: FileSearchEvidence[] = []
    const processing: ProcessingMeta = {
      provider,
      usedFileSearch: false,
      usedFallback: false,
      parsingMode: provider === "openai" ? "structured_json_schema" : "json_extractor",
    }

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
          text: {
            format: {
              type: "json_schema",
              name: "filled_placeholders",
              strict: true,
              schema: outputSchema,
            },
          },
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
        processing.usedFileSearch = true
      } catch (fileSearchError: any) {
        processing.usedFallback = true
        processing.fallbackReason = fileSearchError?.message || "file_search_failed"
        console.error("[v0] file_search 실패, inline prompt fallback 실행:", fileSearchError)

        const fallbackPrompt = buildPrompt({
          placeholderDescriptions,
          dataContent,
          withInlineContent: true,
        })

        const fallbackResult = await openaiClient.responses.create({
          model: "gpt-5.2",
          input: fallbackPrompt,
          text: {
            format: {
              type: "json_schema",
              name: "filled_placeholders_fallback",
              strict: true,
              schema: outputSchema,
            },
          },
          reasoning: { effort: "medium" },
          max_output_tokens: 16000,
        })
        fullText = fallbackResult.output_text
      } finally {
        const vectorStoreCleanup = vectorStoreId
          ? await retryWithBackoff(() => openaiClient.vectorStores.del(vectorStoreId as string).then(() => undefined), "vector store")
          : { ok: true, attempts: 0 }

        const uploadedFileCleanup = uploadedFileId
          ? await retryWithBackoff(() => openaiClient.files.del(uploadedFileId as string).then(() => undefined), "uploaded file")
          : { ok: true, attempts: 0 }

        processing.cleanup = {
          vectorStoreDeleted: vectorStoreCleanup.ok,
          vectorStoreDeleteAttempts: vectorStoreCleanup.attempts,
          uploadedFileDeleted: uploadedFileCleanup.ok,
          uploadedFileDeleteAttempts: uploadedFileCleanup.attempts,
        }
      }
    } else {
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

      for await (const textPart of result.textStream) {
        fullText += textPart
      }
    }

    const filledData = extractJsonObject(fullText) as Record<string, any>
    const normalizedData = normalizeFilledData(filledData)

    const filledPlaceholders = placeholderList.map((p) => {
      const value = normalizedData[p.key]
      return {
        key: p.key,
        value: value ?? (p.isLoop ? [] : ""),
        ...(p.description && { description: p.description }),
        ...(p.isLoop && { isLoop: true, fields: p.fields }),
      }
    })

    return NextResponse.json({
      filledPlaceholders,
      evidence: evidence.length > 0 ? evidence : undefined,
      processing,
    })
  } catch (error: any) {
    if (error?.responseBody?.includes("Incorrect API key") || error?.responseBody?.includes("invalid_api_key")) {
      return NextResponse.json(
        { error: `API 키가 올바르지 않습니다. Settings에서 ${provider === "openai" ? "OpenAI" : "Grok"} API 키를 확인해주세요.` },
        { status: 401 },
      )
    }

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

    return NextResponse.json({ error: errorMessage }, { status: error?.statusCode || 500 })
  }
}
