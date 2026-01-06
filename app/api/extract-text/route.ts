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
      try {
        // --- Polyfills for pdf-parse (pdfjs-dist) in Node.js environment ---
        if (typeof (global as any).DOMMatrix === 'undefined') {
          (global as any).DOMMatrix = class DOMMatrix {
            constructor() { }
            static fromMatrix() { return new DOMMatrix(); }
          };
        }
        // ------------------------------------------------------------------

        // ESM/Next.js 환경에서 pdf-parse 함수를 확실하게 가져오기 위한 방법
        const { createRequire } = await import('module')
        const require = createRequire(import.meta.url)
        let pdfParse: any

        try {
          // 1. 내부 lib 경로로 직접 접근 (가장 확실한 방법)
          pdfParse = require('pdf-parse/lib/pdf-parse.js')
        } catch (e) {
          // 2. 일반적인 로드 시도
          const mod = require('pdf-parse')
          pdfParse = typeof mod === 'function' ? mod : (mod.default || mod)
        }

        if (typeof pdfParse !== 'function') {
          throw new Error('PDF parsing library could not be loaded as a function')
        }

        const data = await pdfParse(buffer)

        text = data.text

        if (!text || text.trim().length === 0) {
          return NextResponse.json({
            error: "PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF이거나 보호된 파일일 수 있습니다."
          }, { status: 400 })
        }
      } catch (pdfError: any) {
        return NextResponse.json({
          error: `PDF 파일 처리 중 오류가 발생했습니다: ${pdfError.message}`
        }, { status: 500 })
      }
    }
    // Word 파일 처리 (.docx만 지원)
    else if (filenameLower.endsWith('.docx')) {
      try {
        const zip = new PizZip(buffer)
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        })

        // Word 문서에서 전체 텍스트 추출
        text = doc.getFullText()

        if (!text || text.trim().length === 0) {
          return NextResponse.json({
            error: "Word 문서에서 텍스트를 추출할 수 없습니다"
          }, { status: 400 })
        }
      } catch (docxError: any) {
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
    const errorMessage = error?.message || "텍스트 추출 중 알 수 없는 오류가 발생했습니다"

    return NextResponse.json({
      error: errorMessage,
      details: error?.properties || {}
    }, { status: 500 })
  }
}
