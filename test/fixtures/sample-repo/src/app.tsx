import React, { useState } from "react";
import { z } from "zod";

const schema = z.object({ name: z.string() });

export function App() {
  const [name, setName] = useState("");
  schema.parse({ name });
  return <div>{name}</div>;
}
