import { Scissors, Sparkles, Split, ArrowLeftRight } from 'lucide-react';

/**
 * 도구 목록 — 문구의 단일 출처.
 *
 * 홈 카드(Home.jsx)와 도구 화면 안내 띠(ToolIntro.jsx)가 같은 문장을 쓴다.
 * id 는 Header.jsx 의 TABS id 와 반드시 일치해야 한다 (탭 이동에 쓰임).
 *
 * tag: '무료' = 브라우저에서만 처리(비용 0) / 'AI' = 서버 분석(과금)
 */
export const TOOLS = [
  {
    id: 'maker',
    label: '판서 제작기',
    Icon: Scissors,
    tag: '무료',
    summary: '교재에서 문제만 잘라내 수업 판서용으로 씁니다',
    steps: ['PDF 열기', '문제 영역 드래그', '복사해서 붙여넣기'],
    accepts: 'PDF',
  },
  {
    id: 'splitter',
    label: 'PDF 분할 · 합치기',
    Icon: Split,
    tag: '무료',
    summary: '페이지를 골라 낱장으로 나누거나, 여러 PDF를 하나로 합칩니다',
    steps: ['PDF 여러 개 열기', '페이지 선택', '합치기 / 분할'],
    accepts: 'PDF',
  },
  {
    id: 'toimage',
    label: 'PDF ↔ 이미지',
    Icon: ArrowLeftRight,
    tag: '무료',
    summary: 'PDF를 이미지로, 여러 이미지를 한 PDF로 바꿉니다',
    steps: ['파일 열기', '화질·형식 선택', '내려받기'],
    accepts: 'PDF · JPEG · PNG · WebP · ZIP',
  },
  {
    id: 'extractor',
    label: '답 추출기',
    Icon: Sparkles,
    tag: 'AI',
    summary: '정답표 사진에서 문제 번호와 정답을 표로 뽑아냅니다',
    steps: ['정답표 열기', 'AI 분석', '복사해서 붙여넣기'],
    accepts: 'PDF · 이미지',
  },
];

export function getTool(id) {
  return TOOLS.find((t) => t.id === id) ?? null;
}
