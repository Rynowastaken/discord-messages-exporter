interface SectionHeadingProps {
  id: string;
  title: string;
  meta?: string;
}

export default function SectionHeading({ id, title, meta }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {meta ? <p className="section-meta">{meta}</p> : null}
    </div>
  );
}
