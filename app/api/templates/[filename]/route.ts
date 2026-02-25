import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"

type Params = {
  params: { filename?: string } | Promise<{ filename?: string }>
}

export async function GET(_: Request, { params }: Params) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const filename = resolvedParams?.filename

    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "유효하지 않은 파일명입니다." }, { status: 400 })
    }

    if (!filename.toLowerCase().endsWith(".docx")) {
      return NextResponse.json({ error: "DOCX 파일만 선택할 수 있습니다." }, { status: 400 })
    }

    const templatePath = path.join(process.cwd(), "template", filename)
    const fileBuffer = await fs.readFile(templatePath)

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error) {
    console.error("[v0] 템플릿 파일 로드 오류:", error)
    return NextResponse.json({ error: "템플릿 파일을 불러오지 못했습니다." }, { status: 500 })
  }
}
