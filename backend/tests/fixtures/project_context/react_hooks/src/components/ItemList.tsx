import { useEffect, useMemo, useState } from "react";

export interface ItemListProps {
  initialItems: string[];
  heading?: string;
}

export const ItemList = (props: ItemListProps) => {
  const [items, setItems] = useState(props.initialItems);
  useEffect(() => {
    setItems(props.initialItems);
  }, [props.initialItems]);
  const count = useMemo(() => items.length, [items]);
  return (
    <section>
      <h3>{props.heading ?? "Items"}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>Total: {count}</p>
    </section>
  );
};
