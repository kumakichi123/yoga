import React, { useState } from "react";
import { Link } from "react-router-dom";

const TEXT = {
  title: "お問い合わせ",
  description: "以下のフォームにご記入ください。内容によっては返信までお時間をいただく場合があります。",
  nameLabel: "お名前（任意）",
  emailLabel: "メールアドレス（返信が必要な場合）",
  emailHint: "返信が必要な場合はメールを入力してください",
  messageLabel: "内容",
  messageRequired: "内容は必須です。",
  messagePlaceholder: "お問い合わせ内容をご入力ください。",
  attachmentLabel: "添付画像（任意）",
  attachmentHint: "最大5MBまでの画像ファイルを添付できます。",
  submit: "送信",
  submitting: "送信中...",
  success: "内容を確認次第ご連絡します。通常2〜3営業日以内。",
  invalidEmail: "メールアドレスの形式が正しくありません。",
  fileTooLarge: "添付は5MB以下に限ります。",
  genericError: "送信に失敗しました。時間を置いて再度お試しください。",
  goBack: "設定ページに戻る",
};

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setSuccess(false);
    setError("");
    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();
    if (!trimmedMessage) {
      setError(TEXT.messageRequired);
      return;
    }
    if (trimmedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError(TEXT.invalidEmail);
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setError(TEXT.fileTooLarge);
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", trimmedEmail);
      formData.append("message", trimmedMessage);
      if (file) {
        formData.append("file", file);
      }
      const response = await fetch("/api/contact", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        let messageText = TEXT.genericError;
        try {
          const err = await response.json();
          if (err?.error === "message_required") {
            messageText = TEXT.messageRequired;
          } else if (err?.error === "invalid_email") {
            messageText = TEXT.invalidEmail;
          } else if (err?.error === "file_too_large") {
            messageText = TEXT.fileTooLarge;
          }
        } catch {
          // ignore parse errors
        }
        setError(messageText);
        return;
      }
      setName("");
      setEmail("");
      setMessage("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      setSuccess(true);
    } catch (err) {
      console.error("contact submit error", err);
      setError(TEXT.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row">
      <div className="card row">
        <h1 style={{ margin: 0 }}>{TEXT.title}</h1>
        <p className="muted">{TEXT.description}</p>
        <form className="row" onSubmit={handleSubmit}>
          <label className="field">
            <span>{TEXT.nameLabel}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="山田 太郎"
            />
          </label>
          <label className="field">
            <span>{TEXT.emailLabel}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <span className="muted" style={{ fontSize: 13 }}>{TEXT.emailHint}</span>
          </label>
          <label className="field">
            <span>
              {TEXT.messageLabel}
              <span style={{ color: "#d53f8c", marginLeft: 8 }}>*</span>
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={TEXT.messagePlaceholder}
              rows={6}
              required
            />
          </label>
          <label className="field">
            <span>{TEXT.attachmentLabel}</span>
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const selected = event.target.files && event.target.files[0] ? event.target.files[0] : null;
                setFile(selected);
              }}
            />
            <span className="muted" style={{ fontSize: 13 }}>{TEXT.attachmentHint}</span>
          </label>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? TEXT.submitting : TEXT.submit}
          </button>
        </form>
        {success && <div style={{ color: "var(--brand-dark)" }}>{TEXT.success}</div>}
        {error && <div style={{ color: "#d53f8c" }}>{error}</div>}
        <div>
          <Link className="btn" to="/settings">
            {TEXT.goBack}
          </Link>
        </div>
      </div>
    </div>
  );
}
