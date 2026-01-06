import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json()

    const buffer = Buffer.from(content)
    const zip = new PizZip(buffer)

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      },
      // 에러를 수집하되 계속 진행
      parser: (tag: string) => {
        return {
          get: (scope: any) => {
            return scope[tag]
          }
        }
      }
    })

    // Extract all placeholders from the template
    // 형식: {{keyword}}, {{keyword:description}}, {{#array}}, {{/array}}, {{parent.child}}, {{parent.child:description}}
    const text = doc.getFullText()

    // 정규표현식 업데이트: 점(.) 문법 지원
    // [1]: #, / 또는 빈 문자열
    // [2]: keyword (parent.child 가능)
    // [3]: description (선택 사항)
    const simpleRegex = /\{\{([#\/]?)([^\s{}:]+)(?::([^}]+))?\}\}/g
    const matches = text.matchAll(simpleRegex)

    // key를 기준으로 중복 제거하고 description 보존
    const placeholderMap = new Map<string, { key: string; description?: string; isLoop?: boolean; fields?: string[] }>()

    // 현재 활성화된 루프 추적
    const activeLoops = new Set<string>()

    for (const match of matches) {
      const prefix = match[1] // #, /, 또는 빈 문자열
      const rawKey = match[2]
      const description = match[3]?.trim()

      // 1. 루프 시작 태그 (#) 처리
      if (prefix === '#') {
        activeLoops.add(rawKey)
        if (!placeholderMap.has(rawKey)) {
          placeholderMap.set(rawKey, {
            key: rawKey,
            isLoop: true,
            ...(description && { description }),
            fields: []
          })
        }
      }
      // 2. 루프 종료 태그 (/)
      else if (prefix === '/') {
        activeLoops.delete(rawKey)
        continue
      }
      // 3. 점(.) 문법 처리 (예: tasks.name)
      else if (rawKey.includes('.')) {
        const [parent, child] = rawKey.split('.')

        if (!placeholderMap.has(parent)) {
          placeholderMap.set(parent, {
            key: parent,
            isLoop: true,
            fields: [child]
          })
        } else {
          const entry = placeholderMap.get(parent)!
          entry.isLoop = true
          if (!entry.fields) entry.fields = []
          if (!entry.fields.includes(child)) {
            entry.fields.push(child)
          }
          if (description && !entry.description) {
            entry.description = description
          }
        }
      }
      // 4. 일반 플레이스홀더 (루프 안에 있으면 필드로 추가)
      else {
        // 활성 루프가 있으면 해당 루프의 필드로 추가
        if (activeLoops.size > 0) {
          // 가장 마지막에 시작된 루프에 추가
          const currentLoop = Array.from(activeLoops)[activeLoops.size - 1]
          const loopEntry = placeholderMap.get(currentLoop)!
          if (!loopEntry.fields) loopEntry.fields = []
          if (!loopEntry.fields.includes(rawKey)) {
            loopEntry.fields.push(rawKey)
          }
        }
        // 루프 밖에 있는 일반 플레이스홀더
        else {
          if (!placeholderMap.has(rawKey)) {
            placeholderMap.set(rawKey, {
              key: rawKey,
              ...(description && { description })
            })
          }
        }
      }
    }

    const placeholders = Array.from(placeholderMap.values())

    // 루프 태그 검증: #/ 쌍 검증 (점 문법은 제외)
    const loopStarts = Array.from(text.matchAll(/\{\{#([a-zA-Z0-9_]+)/g)).map(m => m[1])
    const loopEnds = Array.from(text.matchAll(/\{\{\/([a-zA-Z0-9_]+)/g)).map(m => m[1])

    const warnings: string[] = []

    loopStarts.forEach(key => {
      if (!loopEnds.includes(key)) {
        warnings.push(`루프 태그 경고: {{#${key}}}에 대응하는 {{/${key}}}가 없습니다.`)
      }
    })

    loopEnds.forEach(key => {
      if (!loopStarts.includes(key)) {
        warnings.push(`루프 태그 경고: {{/${key}}}에 대응하는 {{#${key}}}가 없습니다.`)
      }
    })

    return NextResponse.json({
      placeholders,
      warnings: warnings.length > 0 ? warnings : undefined
    })
  } catch (error: any) {
    // 더 상세한 에러 메시지 제공
    const errorMessage = error?.properties?.explanation || error?.message || "Failed to extract placeholders"

    return NextResponse.json({
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
