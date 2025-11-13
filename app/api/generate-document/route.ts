import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

export async function POST(req: NextRequest) {
  try {
    const { templateContent, placeholders } = await req.json()

    const buffer = Buffer.from(templateContent)
    const zip = new PizZip(buffer)

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      },
      // null/undefined 값을 빈 문자열로 처리
      nullGetter: () => {
        return ""
      },
      parser: (tag: string) => {
        // {{keyword:description}} 형식에서 keyword만 추출
        const keyOnly = tag.split(':')[0].trim()
        
        return {
          get: (scope: any) => {
            if (keyOnly === '.') {
              return scope
            }
            return scope[keyOnly] !== undefined ? scope[keyOnly] : ""
          }
        }
      }
    })

    doc.render(placeholders)

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
