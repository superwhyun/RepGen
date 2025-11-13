import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

// Angular parser - docxtemplater에서 제공하는 표준 parser
function angularParser(tag: string) {
  // {{keyword:description}} -> keyword
  const cleanTag = tag.includes(':') ? tag.split(':')[0].trim() : tag
  
  // 표준 angular expression parser
  if (cleanTag === '') {
    return {
      get: function(scope: any) { return scope; }
    }
  }
  return {
    get: function(scope: any, context: any) {
      let obj: any = scope
      const parts = cleanTag.split('.')
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        obj = obj[part]
        if (obj === undefined || obj === null) {
          return undefined
        }
      }
      return obj
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { templateContent, placeholders } = await req.json()

    console.log("[v0] Generating document with placeholders:")
    console.log(JSON.stringify(placeholders, null, 2))

    const buffer = Buffer.from(templateContent)
    const zip = new PizZip(buffer)

    // AI가 반환한 값을 그대로 전달 (문자열 또는 배열)
    const processedPlaceholders: Record<string, any> = {}
    
    for (const [key, value] of Object.entries(placeholders)) {
      if (Array.isArray(value)) {
        // 배열이 반환된 경우 (예외 처리용)
        // 마크다운 표로 변환
        if (value.length > 0 && typeof value[0] === 'object') {
          const headers = Object.keys(value[0])
          const headerRow = `| ${headers.join(' | ')} |`
          const separatorRow = `|${headers.map(() => '------').join('|')}|`
          const dataRows = value.map((item: any) => 
            `| ${headers.map(h => item[h] || '').join(' | ')} |`
          ).join('\n')
          
          processedPlaceholders[key] = `${headerRow}\n${separatorRow}\n${dataRows}`
          console.log(`[v0] Converting array ${key} to markdown table`)
        } else {
          processedPlaceholders[key] = JSON.stringify(value, null, 2)
        }
      } else {
        processedPlaceholders[key] = value
      }
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      },
      nullGetter: () => {
        return ""
      },
      parser: angularParser
    })

    doc.render(processedPlaceholders)
    
    console.log("[v0] Document rendered successfully")

    const output = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    })

    return new NextResponse(output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="filled-document.docx"',
      },
    })
  } catch (error: any) {
    console.error("[v0] Error generating document:", error)
    
    // 더 상세한 에러 메시지 제공
    const errorMessage = error?.properties?.explanation || error?.message || "Failed to generate document"
    
    return NextResponse.json({ 
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
