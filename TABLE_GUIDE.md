# Word 표(Table) 작성 가이드

## 문제 증상
Word 문서에 `[object Object],[object Object],...` 이렇게 표시되나요?

이것은 **루프 태그가 올바르게 작성되지 않았기 때문**입니다.

---

## ✅ 올바른 방법

### Word에서 표 작성 (2행 표):

**1행 (헤더):**
| 이름 | 이메일 | 소속 |

**2행 (데이터 - 이 행이 반복됨):**
| `{{#table}}{{name}}{{/table}}` | `{{email}}` | `{{affiliation}}` |

### 중요 포인트:
- ✅ `{{#table}}`와 `{{/table}}`를 **같은 셀**에 작성
- ✅ 첫 번째 셀: `{{#table}}{{name}}{{/table}}`
- ✅ 두 번째 셀: `{{email}}`
- ✅ 세 번째 셀: `{{affiliation}}`

### Description 포함 시:
첫 번째 셀: `{{#table:작성자 이름, 이메일, 소속을 포함한 표를 만들어주세요}}{{name}}{{/table}}`

---

## ❌ 잘못된 방법 (이렇게 하면 [object Object] 오류!)

### 방법 1 (루프 태그 없음):
```
| {{table}} | | |  ← 배열을 직접 넣으면 [object Object] 발생!
```

### 방법 2 (루프 태그가 다른 행):
```
행1: | {{#table}} | | |
행2: | {{name}} | {{email}} | {{affiliation}} |
행3: | {{/table}} | | |
```
❌ 이렇게 하면 작동하지 않습니다!

---

## 작동 원리

### docxtemplater의 `paragraphLoop: true` 옵션:
- 루프 시작(`{{#array}}`)과 종료(`{{/array}}`)가 **같은 단락(행)**에 있어야 함
- 그 행 전체가 배열 요소 개수만큼 반복됨

### AI가 생성하는 데이터 형식:
```json
{
  "table": [
    {"name": "홍길동", "email": "hong@etri.re.kr", "affiliation": "ETRI"},
    {"name": "김철수", "email": "kim@etri.re.kr", "affiliation": "ETRI"}
  ]
}
```

### 최종 결과:
| 이름 | 이메일 | 소속 |
|------|--------|------|
| 홍길동 | hong@etri.re.kr | ETRI |
| 김철수 | kim@etri.re.kr | ETRI |

---

## 빠른 체크리스트

- [ ] Word 표를 만들었나요?
- [ ] 헤더 행이 있나요?
- [ ] 데이터 행의 첫 번째 셀에 `{{#table}}{{name}}{{/table}}` 형식으로 작성했나요?
- [ ] 나머지 셀에는 `{{email}}`, `{{affiliation}}` 등 일반 플레이스홀더만 있나요?
- [ ] `{{#table}}`와 `{{/table}}`가 같은 행에 있나요?

모두 ✅ 이면 정상 작동합니다!
