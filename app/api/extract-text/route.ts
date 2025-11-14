import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

export async function POST(req: NextRequest) {
  try {
    const { content, filename } = await req.json()

    if (!content || !filename) {
      return NextResponse.json({ 
        error: "파일 내용 또는 파일명이 누락되었습니다" 
      }, { status: 400 })
    }

    console.log("[v0] Extracting text from:", filename)

    const buffer = Buffer.from(content)
    let text: string
    const filenameLower = filename.toLowerCase()

    // 파일 크기 검증
    if (buffer.length === 0) {
      return NextResponse.json({ 
        error: "파일이 비어있습니다" 
      }, { status: 400 })
    }

    // PDF 파일 처리
    if (filenameLower.endsWith('.pdf')) {
      console.log("[v0] Processing PDF file")
      
      try {
        // 동적으로 pdf-parse 로드 (ESM 호환성 문제 해결)
        const pdfParse = (await import('pdf-parse')).default
        const data = await pdfParse(buffer)
        
        text = data.text
        console.log("[v0] Extracted PDF text length:", text.length)
        console.log("[v0] PDF pages:", data.numpages)

        if (!text || text.trim().length === 0) {
          return NextResponse.json({ 
            error: "PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF이거나 보호된 파일일 수 있습니다." 
          }, { status: 400 })
        }
      } catch (pdfError: any) {
        console.error("[v0] PDF parsing error:", pdfError)
        return NextResponse.json({ 
          error: `PDF 파일 처리 중 오류가 발생했습니다: ${pdfError.message}` 
        }, { status: 500 })
      }
    } 
    // Word 파일 처리 (.docx만 지원)
    else if (filenameLower.endsWith('.docx')) {
      console.log("[v0] Processing Word file")
      
      try {
        const zip = new PizZip(buffer)
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        })

        // Word 문서에서 전체 텍스트 추출
        text = doc.getFullText()
        console.log("[v0] Extracted Word text length:", text.length)

        if (!text || text.trim().length === 0) {
          return NextResponse.json({ 
            error: "Word 문서에서 텍스트를 추출할 수 없습니다" 
          }, { status: 400 })
        }
      } catch (docxError: any) {
        console.error("[v0] Word parsing error:", docxError)
        return NextResponse.json({ 
          error: `Word 파일이 손상되었거나 올바른 형식이 아닙니다: ${docxError.message}` 
        }, { status: 500 })
      }
    }
    // .doc 파일 (구버전 Word)
    else if (filenameLower.endsWith('.doc')) {
      return NextResponse.json({ 
        error: ".doc 형식은 지원하지 않습니다. 파일을 .docx 형식으로 변환해주세요." 
      }, { status: 400 })
    }
    else {
      return NextResponse.json({ 
        error: `지원하지 않는 파일 형식입니다: ${filename}` 
      }, { status: 400 })
    }

    return NextResponse.json({ text })
  } catch (error: any) {
    console.error("[v0] Error extracting text:", error)
    
    const errorMessage = error?.message || "텍스트 추출 중 알 수 없는 오류가 발생했습니다"
    
    return NextResponse.json({ 
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
