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
    // 형식: {{keyword}}, {{keyword:description}}, {{#array}}, {{/array}}
    const text = doc.getFullText()
    
    // 일반 플레이스홀더: {{keyword}} 또는 {{keyword:description}}
    const simpleRegex = /\{\{([#\/]?)(\w+)(?::([^}]+))?\}\}/g
    const matches = text.matchAll(simpleRegex)
    
    // key를 기준으로 중복 제거하고 description 보존
    const placeholderMap = new Map<string, { key: string; description?: string; isLoop?: boolean }>()
    
    for (const match of matches) {
      const prefix = match[1] // #, /, 또는 빈 문자열
      const key = match[2]
      const description = match[3]?.trim()
      
      // 루프 시작 태그 (#)만 플레이스홀더로 추가
      if (prefix === '#') {
        if (!placeholderMap.has(key)) {
          placeholderMap.set(key, {
            key,
            isLoop: true,
            ...(description && { description })
          })
        }
      }
      // 루프 종료 태그 (/)는 무시
      else if (prefix === '/') {
        continue
      }
      // 일반 플레이스홀더
      else {
        if (!placeholderMap.has(key)) {
          placeholderMap.set(key, {
            key,
            ...(description && { description })
          })
        }
      }
    }
    
    const placeholders = Array.from(placeholderMap.values())
    
    console.log('[v0] Extracted placeholders:', placeholders)
    
    // 루프 태그 검증: 시작과 종료가 쌍을 이루는지 확인
    const loopStarts = Array.from(text.matchAll(/\{\{#(\w+)/g)).map(m => m[1])
    const loopEnds = Array.from(text.matchAll(/\{\{\/(\w+)/g)).map(m => m[1])
    
    const warnings: string[] = []
    
    // 시작 태그는 있는데 종료 태그가 없는 경우
    loopStarts.forEach(key => {
      if (!loopEnds.includes(key)) {
        warnings.push(`루프 태그 경고: {{#${key}}}에 대응하는 {{/${key}}}가 없습니다.`)
      }
    })
    
    // 종료 태그는 있는데 시작 태그가 없는 경우
    loopEnds.forEach(key => {
      if (!loopStarts.includes(key)) {
        warnings.push(`루프 태그 경고: {{/${key}}}에 대응하는 {{#${key}}}가 없습니다.`)
      }
    })
    
    if (warnings.length > 0) {
      console.log('[v0] Loop tag warnings:', warnings)
    }
    
    console.log('[v0] Loop starts:', loopStarts)
    console.log('[v0] Loop ends:', loopEnds)

    return NextResponse.json({ 
      placeholders,
      warnings: warnings.length > 0 ? warnings : undefined
    })
  } catch (error: any) {
    console.error("[v0] Error extracting placeholders:", error)
    
    // 더 상세한 에러 메시지 제공
    const errorMessage = error?.properties?.explanation || error?.message || "Failed to extract placeholders"
    
    return NextResponse.json({ 
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
