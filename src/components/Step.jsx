export default function Step({ n, title, text }) {
  return (
    <div className="step">
      <b>{n}</b>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
