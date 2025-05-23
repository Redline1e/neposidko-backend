export const fetchOne = async (query) => {
  const results = await query;
  return results[0];
};

