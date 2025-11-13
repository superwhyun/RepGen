import { type NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

export async function POST(req: NextRequest) {
  try {
    const { content, filename } = await req.json()

    console.log("[v0] Extracting text from:", filename)

    const buffer = Buffer.from(content)
    const zip = new PizZip(buffer)
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })

    // Word 문서에서 전체 텍스트 추출
    const text = doc.getFullText()
    
    console.log("[v0] Extracted text length:", text.length)

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
