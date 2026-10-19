export type FieldDef = { enum?: string[]; required?: boolean; link?: string; many?: boolean };

export type TypeDef = {
  name: string;
  dir?: string;
  id?: string;
  summary?: string;
  freeze?: string[];
  fields: Record<string, FieldDef>;
};

export type Schema = { types: TypeDef[]; find(name: string | undefined): TypeDef | undefined };

const ID_TOKEN = /\{n(?::(\d+))?\}/;

export function parseSchema(raw: unknown): Schema {
  const types: TypeDef[] = [];
  if (raw != null) {
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("schema.yml: types must be a mapping of type names");
    for (const [name, value] of Object.entries(raw)) {
      const def = (value ?? {}) as Record<string, unknown>;
      const fields: Record<string, FieldDef> = {};
      for (const [field, spec] of Object.entries((def.fields ?? {}) as Record<string, unknown>)) {
        const f = (spec ?? {}) as Record<string, unknown>;
        if (f.enum !== undefined && !(Array.isArray(f.enum) && f.enum.every((e) => typeof e === "string"))) {
          throw new Error(`schema.yml: ${name}.${field}.enum must be a list of strings`);
        }
        fields[field] = {
          enum: f.enum as string[] | undefined,
          required: f.required === true,
          link: typeof f.link === "string" ? f.link : undefined,
          many: f.many === true,
        };
      }
      const id = typeof def.id === "string" ? def.id : undefined;
      if (id !== undefined && !ID_TOKEN.test(id)) throw new Error(`schema.yml: ${name}.id needs a {n} or {n:4} counter`);
      types.push({
        name,
        dir: typeof def.dir === "string" ? def.dir.replace(/^\.\/|\/$/g, "") : undefined,
        id,
        summary: typeof def.summary === "string" ? def.summary : undefined,
        freeze: Array.isArray(def.freeze) ? def.freeze.filter((x): x is string => typeof x === "string") : undefined,
        fields,
      });
    }
  }
  return {
    types,
    find: (name) => (name ? types.find((t) => t.name.toLowerCase() === name.toLowerCase()) : undefined),
  };
}

// The type a note gets from the directory it lives in, when it names none.
export function typeForPath(schema: Schema, path: string): TypeDef | undefined {
  return schema.types
    .filter((t) => t.dir && path.startsWith(`${t.dir}/`))
    .sort((a, b) => b.dir!.length - a.dir!.length)[0];
}

// "{n:4}" with 7 → "0007"; matches stems that start with an id of this shape.
export function idPattern(id: string): { format(n: number): string; number(stem: string): number | undefined } {
  const m = ID_TOKEN.exec(id)!;
  const width = Number(m[1] ?? 0);
  const [before, after] = [id.slice(0, m.index), id.slice(m.index + m[0].length)];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escape(before)}(\\d+)${escape(after)}(?:-|$)`, "i");
  return {
    format: (n) => `${before}${String(n).padStart(width, "0")}${after}`,
    number: (stem) => {
      const hit = re.exec(stem);
      return hit ? Number(hit[1]) : undefined;
    },
  };
}
