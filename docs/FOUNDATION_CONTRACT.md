# KEIBA-MOBILE Foundation Contract

この文書は、現在の最小構成を安全に保つための契約方針を定める。

## 契約するもの

現在の基盤で壊れてはいけないものだけを契約する。

- Android package identity は `com.pinogame.keibamobile`
- TypeScript が通る
- Expo 設定を解決できる
- Android 向け JavaScript bundle を生成できる
- Android native project を Expo prebuild で生成できる
- 現在の LIVE CORE が扱うデータは、今日のレース、正式出馬表、馬場・天候・発走時刻変更、取消・除外、馬基本情報、最新オッズ、取得時刻
- CI は public repository の標準 GitHub-hosted runner の無料範囲で完結する
- CI は JRA の生通信成功を必須条件にしない

## 契約しないもの

以下は将来の設計変更を阻害するため、契約テストの条件にしない。

- 内部関数名
- ファイル名やディレクトリ配置
- import 文の文字列
- 画面数
- コンポーネント名
- Repository / Service の具体的な分割数
- DB の内部テーブル数
- 実装方式そのもの
- 現在存在する項目だけに固定する完全一致判定
- 将来の新しい画面、データ項目、通知種別、券種、保存方式の追加を禁止する判定

原則は「最低限これが使える」を守ることであり、「これ以外を作るな」ではない。

## 契約テストの作り方

新しい契約を追加するときは、次を満たすこと。

1. ユーザーから見て壊れたと判断できる不変条件である
2. 内部実装を書き換えても同じ挙動なら通る
3. 新しい機能を追加しただけでは落ちない
4. 外部サイトの一時障害や公開タイミングだけで CI が落ちない
5. APK生成のためだけに不要な歴史的条件を要求しない

完全一致ではなく、必要最低限の包含条件を優先する。

## Android の門番

APK生成前の通常CIは次の順で確認する。

1. Foundation contract
2. Typecheck
3. Expo config smoke
4. Android bundle smoke
5. Android native prebuild smoke

`expo prebuild` までは native Android プロジェクト生成の確認であり、APKそのものは生成しない。

APK生成が必要な段階では、この基盤CIを通過した main を入力にする。
