# My Gourmet Guide v2.1 共有版（ローカル保護付き）

- 店舗・写真はSupabaseで共有可能
- 既存IndexedDBは削除しません
- 店舗保存は「端末内 → クラウド」の順。クラウド失敗時も端末内には残ります
- 初回移行も「コピー」で、ローカル元データを削除しません
- Supabase/CDNに接続できない場合でもローカルデータで起動できます
- 住所から位置取得／5km以内検索を維持

## 必須
Supabase SQL Editorで `supabase_step2.sql` を実行して Success を確認してから共有設定を開始してください。
