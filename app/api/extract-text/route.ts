import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

export async function POST(req: NextRequest) {
  try {
    const { content, filename } = await req.json()

    console.log("[v0] Extracting text from:", filename)

    const buffer = Buffer.from(content)
    let text: string

    // PDF 파일 처리
    if (filename.toLowerCase().endsWith('.pdf')) {
      console.log("[v0] Processing PDF file")
      
      // 동적으로 pdf-parse 로드 (ESM 호환성 문제 해결)
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)
      
      text = data.text
      console.log("[v0] Extracted PDF text length:", text.length)
      console.log("[v0] PDF pages:", data.numpages)
    } 
    // Word 파일 처리
    else {
      console.log("[v0] Processing Word file")
      const zip = new PizZip(buffer)
      
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      })

      // Word 문서에서 전체 텍스트 추출
      text = doc.getFullText()
      console.log("[v0] Extracted Word text length:", text.length)
    }

    return NextResponse.json({ text })
  } catch (error: any) {
    console.error("[v0] Error extracting text:", error)
    
    const errorMessage = error?.message || "Failed to extract text"
    
    return NextResponse.json({ 
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
