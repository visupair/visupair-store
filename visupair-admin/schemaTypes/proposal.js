export default {
    name: 'proposal',
    title: 'Proposal',
    type: 'document',
    fields: [
        {
            name: 'name',
            title: 'Name',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'email',
            title: 'Email',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'company',
            title: 'Company',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'service',
            title: 'Service',
            type: 'reference',
            to: [{ type: 'service' }],
            readOnly: true,
        },
        {
            name: 'plan',
            title: 'Selected Plan',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'message',
            title: 'Message',
            type: 'text',
            readOnly: true,
        },
        {
            name: 'createdAt',
            title: 'Created At',
            type: 'datetime',
            readOnly: true,
            initialValue: () => new Date().toISOString(),
        }
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'service.title',
            date: 'createdAt'
        },
        prepare({ title, subtitle, date }) {
            return {
                title: title,
                subtitle: `${subtitle} - ${new Date(date).toLocaleDateString()}`
            }
        }
    }
}
