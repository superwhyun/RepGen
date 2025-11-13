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
    // 형식: {{keyword}} 또는 {{keyword:description}}
    const text = doc.getFullText()
    const placeholderRegex = /\{\{(\w+)(?::([^}]+))?\}\}/g
    const matches = text.matchAll(placeholderRegex)
    
    // key를 기준으로 중복 제거하고 description 보존
    const placeholderMap = new Map<string, { key: string; description?: string }>()
    
    for (const match of matches) {
      const key = match[1]
      const description = match[2]?.trim()
      
      if (!placeholderMap.has(key)) {
        placeholderMap.set(key, {
          key,
          ...(description && { description })
        })
      }
    }
    
    const placeholders = Array.from(placeholderMap.values())

    return NextResponse.json({ placeholders })
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
