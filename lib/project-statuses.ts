// A stage's statuses as the pill shows them (phase123, direct
// instruction): numbered by stage and lettered in order, 3a, 3b, 3c…
export interface StatusLike {
  id: string;
  stage: number;
  label: string;
}

export interface StatusOption {
  id: string;
  code: string;
  label: string;
  text: string;
}

export function statusOptions(statuses: StatusLike[] | undefined, stage: number): StatusOption[] {
  return (statuses ?? [])
    .filter((s) => s.stage === stage)
    .map((s, i) => {
      // a to z, then aa, ab… should a stage ever have more than 26.
      const n = i;
      const letter = n < 26 ? String.fromCharCode(97 + n) : String.fromCharCode(96 + Math.floor(n / 26)) + String.fromCharCode(97 + (n % 26));
      const code = `${stage}${letter}`;
      return { id: s.id, code, label: s.label, text: `${code}. ${s.label}` };
    });
}
