/** Dedupes inventory release when Checkout is cancelled vs session.expired webhook. */
export default {
    name: 'checkoutInventoryRelease',
    title: 'Checkout inventory release',
    type: 'document',
    description: 'Created automatically when a held checkout is abandoned. Safe to delete old.',
    fields: [
        { name: 'sessionId', title: 'Stripe session id', type: 'string', readOnly: true },
        { name: 'source', title: 'Source', type: 'string', readOnly: true },
        {
            name: 'releasedAt',
            title: 'Released at',
            type: 'datetime',
            readOnly: true,
        },
    ],
    preview: {
        select: { title: 'sessionId', subtitle: 'source' },
        prepare({ title, subtitle }) {
            return { title: title || 'Release', subtitle };
        },
    },
};
