import { describe, expect, it } from "vitest";
import {
  filterStudyProducts,
  readStudyProgress,
  studySource,
  type StudyProduct,
} from "../src/lib/study-guide";

const product = (id: string, name: string, category: string, url: string | null): StudyProduct => ({
  id,
  name,
  product_id: category,
  information_source_url: url,
  brand: "Laboratório",
  image_url: null,
  variation: null,
  size: null,
  volume: null,
  weight: null,
  public_description: "Descrição",
  intended_use: "Finalidade",
  usage_instructions: null,
});
const products = [
  product("a", "Peptídeo A", "peptides", "https://pubmed.ncbi.nlm.nih.gov/25738459/"),
  product("b", "Estética B", "aesthetics", null),
];
const defaults = {
  search: "",
  category: "todos",
  source: "all",
  progress: "all",
  studied: new Set<string>(),
};

describe("study guide library", () => {
  it("searches names and brands without requiring accents", () => {
    expect(
      filterStudyProducts(products, { ...defaults, search: "peptideo" }).map((p) => p.id),
    ).toEqual(["a"]);
    expect(filterStudyProducts(products, { ...defaults, search: "laboratorio" })).toHaveLength(2);
  });
  it("combines category, documentation and personal progress", () => {
    expect(
      filterStudyProducts(products, {
        ...defaults,
        category: "peptides",
        source: "with",
        progress: "done",
        studied: new Set(["a"]),
      }).map((p) => p.id),
    ).toEqual(["a"]);
    expect(
      filterStudyProducts(products, {
        ...defaults,
        source: "pending",
        progress: "pending",
        studied: new Set(["a"]),
      }).map((p) => p.id),
    ).toEqual(["b"]);
  });
  it("classifies source type without asserting product approval", () => {
    expect(studySource("https://www.accessdata.fda.gov/label.pdf")?.kind).toBe(
      "Referência regulatória",
    );
    expect(studySource("https://pubmed.ncbi.nlm.nih.gov/123/")?.kind).toBe("Literatura científica");
    expect(studySource("https://fda.gov.evil.example/page")?.kind).toBe("Documentação externa");
  });
  it("rejects unsafe or credential-bearing source URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://user:password@example.com",
      "not a URL",
      null,
    ])
      expect(studySource(value)).toBeNull();
  });
  it("recovers from corrupt progress and deduplicates product ids", () => {
    expect(readStudyProgress("broken")).toEqual([]);
    expect(readStudyProgress('{"a":true}')).toEqual([]);
    expect(readStudyProgress('["a","a",false,14,"b"]')).toEqual(["a", "b"]);
  });
  it("includes future catalog products without requiring a static guide entry", () => {
    expect(
      filterStudyProducts(
        [...products, product("new", "Novo produto", "peptides", null)],
        defaults,
      ),
    ).toHaveLength(3);
  });
});

it("uses the main registered image or the first gallery photo", async () => {
 const {studyImagePath} = await import("../src/lib/study-guide");
 expect(studyImagePath({image_url: "existing.jpg"}, {media: [{kind: "image",path: "other.jpg"}]})).toBe("existing.jpg");
 expect(studyImagePath({image_url: null}, {media: [{kind: "video",path: "video.mp4"},{kind: "image",path: "gallery.jpg"}]})).toBe("gallery.jpg");
 expect(studyImagePath({image_url: null}, {media: [{kind: "image",url: "https://example.com/photo.jpg"}]})).toBe("https://example.com/photo.jpg");
 expect(studyImagePath({image_url: null}, {media: {bad: true}})).toBeNull();
});
