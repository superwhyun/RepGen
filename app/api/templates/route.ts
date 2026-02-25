import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const templateDir = path.join(process.cwd(), "template")
    const entries = await fs.readdir(templateDir, { withFileTypes: true })

    const templates = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("[v0] 템플릿 목록 조회 오류:", error)
    return NextResponse.json({ error: "템플릿 목록을 불러오지 못했습니다." }, { status: 500 })
  }
}
