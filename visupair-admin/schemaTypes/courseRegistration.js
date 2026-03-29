export default {
    name: 'courseRegistration',
    title: 'Course Registration',
    type: 'document',
    fields: [
        {
            name: 'course',
            title: 'Course',
            type: 'reference',
            to: [{ type: 'course' }],
            readOnly: true,
        },
        {
            name: 'courseName',
            title: 'Course Name',
            type: 'string',
            readOnly: true,
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
            name: 'phone',
            title: 'Phone',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'pricingType',
            title: 'Pricing Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Free', value: 'free' },
                    { title: 'Donation', value: 'donation' },
                    { title: 'Pay at the Door', value: 'payAtDoor' },
                    { title: 'Paid', value: 'paid' },
                ],
            },
            readOnly: true,
        },
        {
            name: 'donationAmount',
            title: 'Donation Amount (EUR)',
            type: 'number',
            readOnly: true,
            hidden: ({ document }) => document?.pricingType !== 'donation',
        },
        {
            name: 'createdAt',
            title: 'Registered At',
            type: 'datetime',
            readOnly: true,
            initialValue: () => new Date().toISOString(),
        },
    ],
    preview: {
        select: {
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
            courseName: 'courseName',
            pricingType: 'pricingType',
            donationAmount: 'donationAmount',
            date: 'createdAt',
        },
        prepare({ firstName, lastName, email, courseName, pricingType, donationAmount, date }) {
            const typeIcons = {
                free: '🆓',
                donation: '🎁',
                payAtDoor: '🚪',
                paid: '💳',
            }
            const icon = typeIcons[pricingType] || '📋'
            const donationStr = pricingType === 'donation' && donationAmount ? ` • €${donationAmount} donated` : ''
            return {
                title: `${icon} ${firstName} ${lastName}`,
                subtitle: `${courseName} • ${email}${donationStr} • ${date ? new Date(date).toLocaleDateString() : ''}`,
            }
        },
    },
}
