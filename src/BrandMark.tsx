import './brand.css';
/** Decorative mark: adjacent live text supplies the accessible product name. */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      className="malariascope-mark"
      src="/brand/malariascope-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
