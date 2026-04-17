import { useState } from "react";

export interface CardProps {
  title: string;
  description?: string;
  onSelect?: (value: string) => void;
}

export function Card(props: CardProps) {
  const [active, setActive] = useState(false);
  return (
    <section className="card" aria-pressed={active}>
      <h2>{props.title}</h2>
      {props.description && <p>{props.description}</p>}
      <button onClick={() => setActive((a) => !a)}>Toggle</button>
    </section>
  );
}
