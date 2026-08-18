// The vector space the index is built around. It has to agree with whatever
// model @memex/embed is configured with — db sizes its vec0 tables from this,
// and a mismatch means every vector is rejected at insert time. Kept here
// because both packages need it and neither should depend on the other.
export const EMBEDDING_DIM = 768;
