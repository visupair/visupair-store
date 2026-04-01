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
            description:
                'How this person registered: Free, optional donation (amount below), paid online, or pay at the door.',
            type: 'string',
            options: {
                list: [
                    { title: 'Free', value: 'free' },
                    { title: 'Donation (optional contribution)', value: 'donation' },
                    { title: 'Pay at the Door', value: 'payAtDoor' },
                    { title: 'Paid (online checkout)', value: 'paid' },
                ],
                layout: 'radio',
            },
            readOnly: true,
        },
        {
            name: 'donationAmount',
            title: 'Donation amount',
            description:
                'Amount collected via Stripe for this signup. For “register with no donation”, this is 0.',
            type: 'number',
            readOnly: true,
            hidden: ({ document }) => document?.pricingType !== 'donation',
        },
        {
            name: 'donationCurrency',
            title: 'Donation currency',
            type: 'string',
            readOnly: true,
            options: {
                list: [
                    { title: 'EUR', value: 'EUR' },
                    { title: 'PLN', value: 'PLN' },
                ],
            },
            hidden: ({ document }) => document?.pricingType !== 'donation',
        },
        {
            name: 'paidAmount',
            title: 'Course fee paid',
            description: 'Total charged in Stripe for this course (online paid courses).',
            type: 'number',
            readOnly: true,
            hidden: ({ document }) => document?.pricingType !== 'paid',
        },
        {
            name: 'paidCurrency',
            title: 'Payment currency',
            type: 'string',
            readOnly: true,
            options: {
                list: [
                    { title: 'EUR', value: 'EUR' },
                    { title: 'PLN', value: 'PLN' },
                ],
            },
            hidden: ({ document }) => document?.pricingType !== 'paid',
        },
        {
            name: 'stripeCheckoutSessionId',
            title: 'Stripe checkout session',
            description: 'Present when the student paid or donated through Stripe.',
            type: 'string',
            readOnly: true,
            hidden: ({ document }) => !['donation', 'paid'].includes(document?.pricingType),
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
            donationCurrency: 'donationCurrency',
            paidAmount: 'paidAmount',
            paidCurrency: 'paidCurrency',
            date: 'createdAt',
        },
        prepare({
            firstName,
            lastName,
            email,
            courseName,
            pricingType,
            donationAmount,
            donationCurrency,
            paidAmount,
            paidCurrency,
            date,
        }) {
            const typeIcons = {
                free: '🆓',
                donation: '🎁',
                payAtDoor: '🚪',
                paid: '💳',
            }
            const typeLabels = {
                free: 'Free',
                donation: 'Donation',
                payAtDoor: 'Pay at door',
                paid: 'Paid online',
            }
            const icon = typeIcons[pricingType] || '📋'
            const typeLabel = typeLabels[pricingType] || pricingType || '—'

            const fmtMoney = (amount, currency) =>
                currency === 'PLN' ? `${amount}zł` : `€${amount}`

            let moneySummary = ''
            if (pricingType === 'free') {
                moneySummary = ' — Free'
            } else if (pricingType === 'payAtDoor') {
                moneySummary = ' — Pay at door'
            } else if (pricingType === 'donation') {
                if (donationAmount != null && Number(donationAmount) > 0) {
                    moneySummary = ` — ${fmtMoney(donationAmount, donationCurrency)} donated`
                } else {
                    moneySummary = ' — No donation'
                }
            } else if (pricingType === 'paid' && paidAmount != null) {
                moneySummary = ` — ${fmtMoney(paidAmount, paidCurrency)} paid`
            }

            const dateStr = date ? new Date(date).toLocaleString() : ''

            return {
                title: `${icon} ${firstName} ${lastName}`,
                subtitle: `${courseName} • ${typeLabel}${moneySummary} • ${email}${dateStr ? ` • ${dateStr}` : ''}`,
            }
        },
    },
}
