import { useState } from 'react';
export function saveText(name: string, text: string, type = 'application/json') {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function LocalRecovery({
  error,
  raw,
  reload,
  restart,
}: {
  error: string;
  raw: string | null;
  reload: () => void;
  restart: () => boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!error) return null;
  return (
    <section role="alert" aria-label="Pemulihan penyimpanan">
      <h3>Penyimpanan memerlukan perhatian</h3>
      <p>{error} Penyimpanan baru diblokir agar data yang sudah ada tidak tertimpa.</p>
      <button
        onClick={() => {
          setConfirm(false);
          reload();
        }}
      >
        Muat ulang data tersimpan
      </button>
      {raw !== null && (
        <>
          <button onClick={() => saveText('malariascope-original-backup.json', raw)}>
            Unduh data asli
          </button>
          <button onClick={() => setConfirm(true)}>Mulai ulang dengan cadangan</button>
        </>
      )}
      {confirm && (
        <div>
          <p>
            Data saat ini akan disalin ke cadangan pemulihan di peramban sebelum penyimpanan baru
            dibuat. Unduh data asli untuk cadangan di luar peramban.
          </p>
          <button
            onClick={() => {
              if (restart()) setConfirm(false);
            }}
          >
            Konfirmasi cadangkan dan mulai ulang
          </button>
          <button onClick={() => setConfirm(false)}>Batal pemulihan</button>
        </div>
      )}
    </section>
  );
}
