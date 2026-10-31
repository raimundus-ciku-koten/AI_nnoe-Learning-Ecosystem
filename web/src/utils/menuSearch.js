function normalisasi(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('id').trim();
}

export function filterMenuSearch(groups, query, limit = 8) {
    const term = normalisasi(query);
    if (!term || !Array.isArray(groups)) return [];

    const seen = new Set();
    return groups.flatMap((group) => (Array.isArray(group.item) ? group.item : [])
        .filter((item) => {
            const key = `${item?.path || ''}?${item?.search || ''}`;
            if (!item?.path || seen.has(key) || !normalisasi(`${item.label} ${group.label}`).includes(term)) return false;
            seen.add(key);
            return true;
        })
        .map((item) => ({ groupLabel: group.label, item })))
        .slice(0, Math.max(0, limit));
}