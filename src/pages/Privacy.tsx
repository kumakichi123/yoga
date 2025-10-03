import React from "react";
import { Link } from "react-router-dom";

export default function Privacy(){
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>プライバシーポリシー</h1>
        <p>朝部耀平（個人事業主）（以下「当方」）は、本サービスをご利用いただく皆さまの個人情報を適切に取り扱うため、以下のとおりプライバシーポリシーを定めます。</p>
        <section>
          <h2>1. 収集する情報</h2>
          <p>当方は本サービスの提供にあたり、以下の情報を取得することがあります。</p>
          <ul>
            <li>メールアドレスなど、ユーザーがログインのために提供する情報</li>
            <li>匿名ID、利用履歴、セッションの記録など、本サービスの利用状況に関する情報</li>
            <li>端末情報、Cookie等を用いたアクセス解析情報</li>
          </ul>
        </section>
        <section>
          <h2>2. 利用目的</h2>
          <p>取得した情報は、以下の目的のために利用します。</p>
          <ul>
            <li>本サービスの提供、維持、改善のため</li>
            <li>ログイン認証およびユーザーの本人確認のため</li>
            <li>サービスに関するお知らせやサポート対応のため</li>
            <li>統計データの作成など、本サービスの利便性向上のため</li>
          </ul>
        </section>
        <section>
          <h2>3. 情報の共有</h2>
          <p>当方は、法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供しません。ただし、業務委託先等に業務を委託する場合は、必要な範囲で情報を提供することがあります。</p>
        </section>
        <section>
          <h2>4. 安全管理</h2>
          <p>当方は、個人情報への不正アクセスや漏えい等を防止するため、適切な安全管理措置を講じます。</p>
        </section>
        <section>
          <h2>5. 開示・訂正・削除</h2>
          <p>ユーザーは、ご自身の個人情報について開示、訂正、利用停止、削除を希望される場合、当方所定の方法にてご連絡いただければ、適切に対応いたします。</p>
        </section>
        <section>
          <h2>6. 改定</h2>
          <p>本ポリシーの内容は、必要に応じて変更することがあります。重要な変更がある場合は、アプリ内のお知らせ等により通知いたします。</p>
        </section>
        <section>
          <h2>お問い合わせ</h2>
          <p>個人情報の取扱いに関するお問い合わせは <a href="mailto:support@ai-secretary.site">support@ai-secretary.site</a> までお願いします。</p>
        </section>
      </div>
      <div className="legal-back"><Link to="/settings">設定に戻る</Link></div>
    </div>
  );
}
