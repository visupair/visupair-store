export default {
    name: 'supportSubmission',
    title: 'Support Submission',
    type: 'document',
    fields: [
        {
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'New', value: 'new' },
                    { title: 'In Progress', value: 'in_progress' },
                    { title: 'Resolved', value: 'resolved' },
                    { title: 'Closed', value: 'closed' },
                ],
                layout: 'radio',
            },
            initialValue: 'new',
        },
        {
            name: 'firstName',
            title: 'First Name',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'lastName',
            title: 'Last Name',
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
            name: 'subject',
            title: 'Subject',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'message',
            title: 'Message',
            type: 'text',
            rows: 6,
            readOnly: true,
        },
        {
            name: 'notes',
            title: 'Internal Notes',
            type: 'text',
            rows: 4,
            description: 'Private notes visible only in Sanity Studio.',
        },
        {
            name: 'createdAt',
            title: 'Submitted At',
            type: 'datetime',
            readOnly: true,
            initialValue: () => new Date().toISOString(),
        },
    ],
    orderings: [
        {
            title: 'Newest First',
            name: 'createdAtDesc',
            by: [{ field: 'createdAt', direction: 'desc' }],
        },
        {
            title: 'Status',
            name: 'statusAsc',
            by: [{ field: 'status', direction: 'asc' }],
        },
    ],
    preview: {
        select: {
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
            subject: 'subject',
            status: 'status',
            date: 'createdAt',
        },
        prepare(selection) {
            const { firstName, lastName, email, subject, status, date } = selection
            const statusEmoji = {
                new: '🆕',
                in_progress: '🔄',
                resolved: '✅',
                closed: '🔒',
            }[status] ?? '📩'
            return {
                title: `${statusEmoji} ${firstName ?? ''} ${lastName ?? ''}`.trim(),
                subtitle: `${subject ?? '(no subject)'} · ${email} · ${date ? new Date(date).toLocaleDateString() : '—'}`,
            }
        },
    },
}
