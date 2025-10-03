import React from "react";
import { Link } from "react-router-dom";

export default function Commerce(){
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>特定商取引法に基づく表記</h1>
        <p>本表記は、朝部耀平（個人事業主）が提供する本サービスに適用されます。</p>
        <dl>
          <dt>販売業者</dt><dd>朝部耀平（個人事業主）</dd>
          <dt>運営責任者</dt><dd>朝部耀平</dd>
          <dt>所在地</dt><dd>札幌市北区北18条西6-1-7-201</dd>
          <dt>連絡先</dt><dd><a href="mailto:support@ai-secretary.site">support@ai-secretary.site</a></dd>
          <dt>販売価格</dt><dd>各プランの表示価格（消費税を含む）</dd>
          <dt>商品代金以外の必要料金</dt><dd>インターネット接続料、通信料などの諸費用はユーザーのご負担となります。</dd>
          <dt>支払い方法</dt><dd>クレジットカード決済等、当方が指定する方法</dd>
          <dt>支払い時期</dt><dd>各決済サービスの定める時期</dd>
          <dt>サービス提供時期</dt><dd>決済手続き完了後即時にご利用いただけます。</dd>
          <dt>返品・キャンセル</dt><dd>デジタルコンテンツの性質上、購入後の返品・キャンセルはお受けしておりません。</dd>
          <dt>動作環境</dt><dd>最新のWebブラウザをご利用ください。詳細はお問い合わせください。</dd>
        </dl>
      </div>
      <div className="legal-back"><Link to="/settings">設定に戻る</Link></div>
    </div>
  );
}
