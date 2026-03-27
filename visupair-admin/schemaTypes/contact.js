export default {
    name: 'contact',
    title: 'Contact Submission',
    type: 'document',
    fields: [
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
            name: 'company',
            title: 'Company',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'message',
            title: 'Message',
            type: 'text',
            rows: 5,
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
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
            date: 'createdAt'
        },
        prepare(selection) {
            const { firstName, lastName, email, date } = selection
            return {
                title: `${firstName} ${lastName}`,
                subtitle: `${email} - ${date ? new Date(date).toLocaleDateString() : 'No date'}`
            }
        }
    }
}
