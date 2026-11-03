import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

/** the previous page, as the browser's back button; Backspace outside a field does the same */
export function BackLink() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      router.history.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return (
    <button
      onClick={() => router.history.back()}
      title="back (Backspace)"
      className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
    >
      ← back
    </button>
  );
}
