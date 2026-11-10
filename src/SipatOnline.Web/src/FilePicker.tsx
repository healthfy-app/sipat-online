export default function FilePicker({
  id,
  accept,
  buttonLabel,
  file,
  required,
  disabled,
  onChange,
}: {
  id: string;
  accept: string;
  buttonLabel: string;
  file?: File | null;
  required?: boolean;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="file-picker">
      <input
        accept={accept}
        className="file-picker-input"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          if (file === undefined) event.target.value = '';
        }}
        required={required}
        type="file"
      />
      <label className={`button button-secondary${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
        {buttonLabel}
      </label>
      {file !== undefined && (
        <span className="file-picker-name">{file ? file.name : 'Nenhum arquivo selecionado'}</span>
      )}
    </div>
  );
}
