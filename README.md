# KEIBA-MOBILE

競馬当日の実戦専用Androidアプリ。

## LIVE CORE v1

- 今日のJRA開催 / レース一覧
- 正式馬番付き出馬表
- 馬場・天候・発走時刻変更
- 出走取消 / 除外のお知らせ
- 出走馬の基本情報
- JRA LIVEオッズ（単勝・複勝・枠連・馬連・ワイド・馬単・3連複・3連単）
- オッズ取得時刻の保持
- 当日専用SQLite

初回は「今日のレース」を開くとJRA開催日程を取得する。正式出馬表が公開済みなら検証後に保存する。
アプリ起動中は期限が来た正式出馬表だけを差分更新し、前回正式状態との差をお知らせへ記録する。

## 境界

KEIBA-MOBILE は研究所ではない。L1/L2/L3研究、虫、Arena、年代検証、100年INDEX、Backfill管理は持ち込まない。
正式モデルの推論接続はLIVE CORE安定後に行う。

## Android

Android package:

`com.pinogame.keibamobile`

ローカル実機ビルド:

`npm run android`

CIではAPKを生成せず、`expo export --platform android` によるAndroid bundle smokeまで行う。
これによりTypeScriptだけでなくMetroの依存解決・Android向けbundle生成も検証する。

## コスト

GitHub Actionsはpublic repositoryの標準 `ubuntu-latest` のみ使用する。
有料runner / GPU / 課金対象ストレージ等は使用しない。
