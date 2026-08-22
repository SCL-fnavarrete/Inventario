'use client';

import SignaturePad from './SignaturePad';

type OfficialEvidenceFieldsProps = {
  kind: 'entrega' | 'devolucion';
  signature: string | null;
  onSignatureChange: (value: string | null) => void;
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
  disabled?: boolean;
  suffix?: string;
};

export default function OfficialEvidenceFields({
  kind,
  signature,
  onSignatureChange,
  accepted,
  onAcceptedChange,
  disabled = false,
  suffix = '',
}: OfficialEvidenceFieldsProps) {
  const title = kind === 'entrega' ? 'Evidencia de entrega' : 'Evidencia de devolución';
  const signatureLabel = `Firma de ${kind}${suffix}`;
  const policyId = `acepta-politica-${kind}${suffix}`.replace(/\s+/g, '-').toLowerCase();

  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
      <legend className="px-1 text-sm font-medium text-gray-900">{title}</legend>
      <SignaturePad label={signatureLabel} value={signature} onChange={onSignatureChange} disabled={disabled} />
      <label htmlFor={policyId} className="flex items-start gap-2 text-sm text-gray-700">
        <input
          id={policyId}
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          disabled={disabled}
          className="mt-0.5 rounded border-gray-300"
        />
        Acepto la política de uso de equipos y confirmo que esta evidencia corresponde al acto realizado.
      </label>
      {signature && <p className="text-xs text-green-700">Firma capturada.</p>}
    </fieldset>
  );
}
