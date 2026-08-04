# HReviewer

1인 개발자(리뷰해줄 시니어가 없는 사람)를 위한 AI 코드 리뷰 SaaS. 팀용 리뷰 시장(CodeRabbit/Greptile 영역)과 정면 경쟁하지 않고, 개인의 리뷰 이력 누적을 차별점으로 삼는다.

## Language

**Wedge (쐐기)**:
포화 시장에 진입하기 위한 가장 좁고 뾰족한 단일 기능. HReviewer의 wedge는 "같은 실수, 지난 PR에서도 지적했는데 또 하고 있어요" 알림(반복 실수 감지)이다.
_Avoid_: 차별화 기능 전반을 뭉뚱그려 wedge라 부르는 것 — wedge는 정확히 하나의 기능을 가리킨다.

**Issue**:
PR 리뷰에서 AI가 생성한 단일 지적. 카테고리 1개, 코드 범위(file + line 또는 null), 텍스트를 가진다. 1 Issue = 1 row 원칙.
_Avoid_: suggestion과 혼용 (suggestion은 committable 코드 변경 제안, issue는 지적)

**Repeat (반복 지적)**:
같은 사용자의 90일 이내 과거 Issue 중 같은 카테고리 + embedding 유사도 threshold 이상인 것이 존재하는 Issue. PR 코멘트에 `⚠️ 반복 지적` 배지로 표시된다.

**Pre-build gate**:
기능 구현 착수 전에 통과해야 하는 검증 조건. growth-archive의 gate는 Track A(캘리브레이션 스파이크로 기술 검증) 통과. (2026-07-12 재설계 시 포함됐던 Track B(공개 글 pain 검증)는 2026-07-13 결정으로 제거 — 도입 판단은 개발자 재량.)

**Calibration spike (캘리브레이션 스파이크)**:
wedge 빌드 전에, 이미 쌓인 리뷰 데이터로 repeat detection의 실현 가능성(FP ≤ 20%가 되는 similarity threshold 존재 여부)을 확인하는 1~2일 실험. 통과하지 못하면 빌드 없이 wedge를 kill한다.
