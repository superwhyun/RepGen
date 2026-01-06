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
      get: function (scope: any) { return scope; }
    }
  }
  return {
    get: function (scope: any, context: any) {
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

// XML 전처리기: 점 문법(tasks.name)을 찾아 해당 행을 {#tasks}...{/tasks}로 감싸고 태그를 {{name}}으로 단순화합니다.
function preProcessXml(xml: string): string {
  // 1. 모든 테이블 행(<w:tr>)을 찾습니다.
  const trRegex = /<w:tr(?: [^>]+)?>[\s\S]*?<\/w:tr>/g

  return xml.replace(trRegex, (rowXml) => {
    // 워드 XML에서는 {{task.name}}이 내부적으로 <w:t> 태그 등으로 쪼개져 있을 수 있습니다.
    // 이를 감지하기 위해 태그를 제거한 순수 텍스트에서 먼저 확인합니다.
    const strippedText = rowXml.replace(/<[^>]+>/g, '')
    const dotMatch = strippedText.match(/\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_\.]+)(?::[^}]+)?\}\}/)

    if (dotMatch) {
      const parentName = dotMatch[1]

      // 2. 행 전체에서 parent. 형식이 포함된 모든 태그를 찾아 {{child}}로 바꿉니다.
      // 스타일 태그(<...>)가 태그 중간에 끼어있을 수 있으므로 유연하게 매칭하지만, 
      // 플레이스홀더 경계({{ }})를 넘지 않도록 제한합니다.
      const flexibleDotRegex = /\{\{(?:(?!\{\{|\}\})[\s\S])*?([a-zA-Z0-9_]+)(?:(?!\{\{|\}\})[\s\S])*?\.(?:(?!\{\{|\}\})[\s\S])*?([a-zA-Z0-9_\.]+)(?:(?!\{\{|\}\})[\s\S])*?\}\}/g

      let newRowXml = rowXml.replace(flexibleDotRegex, (match, p, c) => {
        if (p === parentName) {
          // 지침(description)이 있다면 보존 시도
          const descMatch = match.match(/:((?:(?!\{\{|\}\})[\s\S])*)/)
          const desc = descMatch ? `:${descMatch[1]}` : ''
          return `{{${c}${desc}}}`
        }
        return match
      })

      // 3. 행의 시작과 끝에 루프 태그를 삽입합니다.
      // 델리미터가 {{ }} 로 설정되어 있으므로 이를 준수해야 합니다.
      const firstWtIndex = newRowXml.indexOf('<w:t')
      if (firstWtIndex !== -1) {
        const firstWtEndIndex = newRowXml.indexOf('>', firstWtIndex) + 1
        newRowXml = newRowXml.slice(0, firstWtEndIndex) + `{{#${parentName}}}` + newRowXml.slice(firstWtEndIndex)
      }

      // 마지막 </w:t> 태그를 찾아 그 앞에 {/parent}를 넣습니다.
      const lastWtOpenIndex = newRowXml.lastIndexOf('</w:t>')
      if (lastWtOpenIndex !== -1) {
        newRowXml = newRowXml.slice(0, lastWtOpenIndex) + `{{/${parentName}}}` + newRowXml.slice(lastWtOpenIndex)
      }

      return newRowXml
    }

    return rowXml
  })
}

export async function POST(req: NextRequest) {
  try {
    const { templateContent, placeholders } = await req.json()

    const buffer = Buffer.from(templateContent)
    const zip = new PizZip(buffer)

    // --- XML Pre-processing ---
    try {
      const docXmlPath = "word/document.xml"
      const file = zip.file(docXmlPath)
      if (file) {
        let docXml = file.asText()
        const processedXml = preProcessXml(docXml)
        zip.file(docXmlPath, processedXml)
      }
    } catch (err) {
      // XML Pre-processing failed, continue with original
    }
    // --------------------------

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

    doc.render(placeholders)

    const output = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    })

    // Buffer를 Uint8Array로 변환하여 NextResponse에 전달
    const responseBody = new Uint8Array(output)

    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="filled-document.docx"',
      },
    })
  } catch (error: any) {
    const errorMessage = error?.properties?.explanation || error?.message || "Failed to generate document"

    return NextResponse.json({
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
