export function SectionHeading({
  title,
  kicker,
  light = false,
}: {
  title: string;
  kicker?: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      {kicker ? (
        <p
          className={`text-xs font-bold uppercase tracking-[0.16em] ${light ? "text-seedrix-mint" : "text-seedrix-green"}`}
        >
          {kicker}
        </p>
      ) : null}
      <h2
        className={`mt-2 text-3xl font-bold sm:text-4xl ${light ? "text-seedrix-white" : "text-seedrix-green"}`}
      >
        {title}
      </h2>
    </div>
  );
}
