// Renders structured data (JSON-LD) as an inline script tag.
// Server component — data is a plain object, serialized deterministically.

type Props = { data: object };

export function JsonLd({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
