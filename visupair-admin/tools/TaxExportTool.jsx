/* global Blob, URL, document */
import {useCallback, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {DownloadIcon} from '@sanity/icons'
import {Box, Button, Card, Flex, Heading, Stack, Text, TextInput} from '@sanity/ui'
import ExcelJS from 'exceljs'

/** Short PL (tax office) + short EN subtitle — rendered as small grey text under Polish in one cell. */
const PRINT_HEADER_PARTS = [
  {pl: 'Data sprzedaży', en: 'sale date'},
  {pl: 'Nr zamówienia', en: 'order ref.'},
  {pl: 'Status płatności', en: 'payment status'},
  {pl: 'Nabywca', en: 'buyer'},
  {pl: 'Kraj', en: 'country'},
  {pl: 'Kwota brutto', en: 'gross paid'},
  {pl: 'Brutto PLN', en: 'gross PLN'},
  {pl: 'Stripe', en: 'payment link'},
  {pl: 'Pozycje', en: 'line items'},
  {pl: 'Netto PLN', en: 'net PLN'},
  {pl: 'VAT PLN', en: 'VAT PLN'},
  {pl: 'Stawka VAT', en: 'VAT %'},
]

const FULL_HEADER_PARTS = [
  {pl: 'Data sprzedaży', en: 'sale date'},
  {pl: 'Nr zamówienia', en: 'order ref.'},
  {pl: 'Status płatności', en: 'payment status'},
  {pl: 'Nabywca', en: 'buyer name'},
  {pl: 'E-mail', en: 'email'},
  {pl: 'Kraj', en: 'country'},
  {pl: 'Waluta', en: 'currency'},
  {pl: 'Brutto (waluta)', en: 'gross'},
  {pl: 'Brutto PLN', en: 'gross PLN'},
  {pl: 'ID Stripe', en: 'Stripe ID'},
  {pl: 'Link Stripe', en: 'URL'},
  {pl: 'Pozycje', en: 'line items'},
  {pl: 'Netto PLN', en: 'net PLN'},
  {pl: 'VAT PLN', en: 'VAT PLN'},
  {pl: 'Stawka VAT', en: 'VAT %'},
]

/** Column widths — tuned to short headers; margins stay tight for A4. */
const PRINT_COL_WIDTHS = [11, 14, 13, 19, 10, 14, 12, 13, 24, 11, 11, 10]

const FULL_COL_WIDTHS = [20, 28, 18, 20, 26, 12, 9, 16, 14, 26, 36, 40, 12, 12, 12]

const ORDERS_QUERY = `
 *[_type == "order" && defined(createdAt) && createdAt >= $from && createdAt <= $to]
  | order(createdAt asc) {
    createdAt,
    orderNumber,
    status,
    customerName,
    customerEmail,
    "buyerCountry": shippingAddress.country,
    totalAmount,
    currency,
    stripePaymentIntentId,
    items[]{
      quantity,
      price,
      variant,
      "title": coalesce(product->name, "")
    }
  }
`

/**
 * Solid black borders on the table (clear lines between cells).
 * Sheet gridlines stay ON separately so empty areas still show Excel’s normal grid.
 */
const GRID_BORDER = {
  top: {style: 'thin', color: {argb: 'FF000000'}},
  left: {style: 'thin', color: {argb: 'FF000000'}},
  bottom: {style: 'thin', color: {argb: 'FF000000'}},
  right: {style: 'thin', color: {argb: 'FF000000'}},
}

const DATA_ALIGNMENT = {vertical: 'middle', horizontal: 'center', wrapText: true}

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {argb: 'FFE8E8E8'},
}

const ALT_ROW_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {argb: 'FFF9F9F9'},
}

function saleDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function stripeDashboardLink(pid) {
  if (!pid || typeof pid !== 'string') return ''
  if (pid.startsWith('free_claim_')) return ''
  if (pid.startsWith('pi_')) return `https://dashboard.stripe.com/payments/${pid}`
  if (pid.startsWith('cs_')) return `https://dashboard.stripe.com/checkout/sessions/${pid}`
  return `https://dashboard.stripe.com/search?query=${encodeURIComponent(pid)}`
}

function summarizeLines(items) {
  if (!items?.length) return ''
  return items
    .map((row) => {
      const q = row.quantity ?? 1
      const t = row.title || 'produkt'
      const bits = [`${q}× ${t}`.trim()]
      if (row.variant) bits.push(String(row.variant))
      return bits.join(' — ')
    })
    .join(' | ')
}

function parseAmount(n) {
  if (n === null || n === undefined) return null
  const num = Number(n)
  return Number.isFinite(num) ? num : null
}

/** Human-readable gross + ISO currency for the print sheet (PL locale decimals). */
function grossWithCurrency(amount, currencyCode) {
  const n = parseAmount(amount)
  if (n === null) return ''
  const formatted = n.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const ccy = (currencyCode || '').toUpperCase()
  return ccy ? `${formatted} ${ccy}` : formatted
}

function buyerLines(name, email) {
  const parts = [name, email].map((s) => (s || '').trim()).filter(Boolean)
  return parts.join('\n')
}

/** One cell: bold Polish, newline, smaller grey English (no “EN:” labels). */
function headerRichText(pl, en) {
  return {
    richText: [
      {
        font: {bold: true, size: 10, name: 'Calibri', color: {argb: 'FF000000'}},
        text: `${pl}\n`,
      },
      {
        font: {size: 8, name: 'Calibri', color: {argb: 'FF666666'}},
        text: en,
      },
    ],
  }
}

function applyHeaderRow(sheet, parts, height) {
  const colCount = parts.length
  const headerRow = sheet.addRow(Array.from({length: colCount}, () => null))
  headerRow.height = height
  parts.forEach((part, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = headerRichText(part.pl, part.en)
    cell.alignment = {vertical: 'middle', wrapText: true, horizontal: 'center'}
    cell.fill = HEADER_FILL
    cell.border = GRID_BORDER
  })
}

function applyHeaderRowFull(sheet, parts, height) {
  const colCount = parts.length
  const headerRow = sheet.addRow(Array.from({length: colCount}, () => null))
  headerRow.height = height
  parts.forEach((part, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = headerRichText(part.pl, part.en)
    cell.alignment = {vertical: 'middle', wrapText: true, horizontal: 'center'}
    cell.fill = HEADER_FILL
    cell.border = GRID_BORDER
  })
}

function addPrintSheet(workbook, documents) {
  const sheet = workbook.addWorksheet('A4 print', {
    views: [{state: 'frozen', ySplit: 1, showGridLines: true}],
    properties: {defaultRowHeight: 20},
  })

  Object.assign(sheet.pageSetup, {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    showGridLines: true,
    margins: {
      left: 0.28,
      right: 0.28,
      top: 0.38,
      bottom: 0.38,
      header: 0.18,
      footer: 0.18,
    },
    horizontalCentered: false,
    verticalCentered: false,
    printTitlesRow: '1:1',
  })

  PRINT_COL_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })

  applyHeaderRow(sheet, PRINT_HEADER_PARTS, 36)

  let rowNum = 0
  for (const doc of documents) {
    rowNum += 1
    const waluta = (doc.currency || '').toUpperCase()
    const brutto = parseAmount(doc.totalAmount)
    const bruttoPln = waluta === 'PLN' && brutto != null ? brutto : null
    const pid = doc.stripePaymentIntentId || ''
    const link = stripeDashboardLink(pid)

    const row = sheet.addRow([
      saleDate(doc.createdAt),
      doc.orderNumber || '',
      doc.status || '',
      buyerLines(doc.customerName, doc.customerEmail),
      doc.buyerCountry || '',
      grossWithCurrency(doc.totalAmount, doc.currency),
      bruttoPln,
      null,
      summarizeLines(doc.items),
      '',
      '',
      '',
    ])

    row.font = {size: 11, name: 'Calibri'}
    row.alignment = DATA_ALIGNMENT
    row.height = 42

    const stripeCell = row.getCell(8)
    if (link) {
      stripeCell.value = {
        text: 'Otwórz / open',
        hyperlink: link,
      }
      stripeCell.font = {size: 11, name: 'Calibri', color: {argb: 'FF0563C1'}, underline: true}
    } else {
      stripeCell.value = pid.startsWith('free_claim_') ? '—' : pid || '—'
      stripeCell.font = {size: 11, name: 'Calibri'}
    }
    stripeCell.alignment = DATA_ALIGNMENT

    const numFmt = '#,##0.00'
    const c7 = row.getCell(7)
    if (typeof c7.value === 'number') c7.numFmt = numFmt

    const fill = rowNum % 2 === 0 ? ALT_ROW_FILL : undefined
    for (let c = 1; c <= PRINT_COL_WIDTHS.length; c++) {
      const cell = row.getCell(c)
      cell.border = GRID_BORDER
      if (fill) cell.fill = fill
    }
  }
}

function addFullDetailSheet(workbook, documents) {
  const sheet = workbook.addWorksheet('All columns', {
    views: [{state: 'frozen', ySplit: 1, showGridLines: true}],
    properties: {defaultRowHeight: 18},
  })

  Object.assign(sheet.pageSetup, {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    showGridLines: true,
    margins: {
      left: 0.28,
      right: 0.28,
      top: 0.38,
      bottom: 0.38,
      header: 0.18,
      footer: 0.18,
    },
    printTitlesRow: '1:1',
  })

  FULL_COL_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })

  applyHeaderRowFull(sheet, FULL_HEADER_PARTS, 36)

  let idx = 0
  for (const doc of documents) {
    idx += 1
    const waluta = doc.currency || ''
    const brutto = parseAmount(doc.totalAmount)
    const bruttoPln = waluta === 'PLN' && brutto != null ? brutto : null

    const row = sheet.addRow([
      saleDate(doc.createdAt),
      doc.orderNumber || '',
      doc.status || '',
      doc.customerName || '',
      doc.customerEmail || '',
      doc.buyerCountry || '',
      waluta,
      brutto,
      bruttoPln,
      doc.stripePaymentIntentId || '',
      stripeDashboardLink(doc.stripePaymentIntentId),
      summarizeLines(doc.items),
      '',
      '',
      '',
    ])

    row.font = {size: 10, name: 'Calibri'}
    row.alignment = DATA_ALIGNMENT

    const numFmt = '#,##0.00'
    const c8 = row.getCell(8)
    const c9 = row.getCell(9)
    if (typeof c8.value === 'number') c8.numFmt = numFmt
    if (typeof c9.value === 'number') c9.numFmt = numFmt

    const fill = idx % 2 === 0 ? ALT_ROW_FILL : undefined
    for (let c = 1; c <= FULL_HEADER_PARTS.length; c++) {
      const cell = row.getCell(c)
      cell.border = GRID_BORDER
      if (fill) cell.fill = fill
    }
  }
}

async function buildWorkbook(documents) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Visupair'
  workbook.created = new Date()

  addPrintSheet(workbook, documents)
  addFullDetailSheet(workbook, documents)

  const buf = await workbook.xlsx.writeBuffer()
  return buf
}

export function TaxExportTool() {
  const client = useClient({apiVersion: '2024-03-01'})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const defaultRange = useMemo(() => {
    const end = new Date()
    const start = new Date(end)
    start.setMonth(start.getMonth() - 3)
    const toYmd = (d) => d.toISOString().slice(0, 10)
    return {from: toYmd(start), to: toYmd(end)}
  }, [])

  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)

  const download = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const from = `${fromDate}T00:00:00.000Z`
      const to = `${toDate}T23:59:59.999Z`
      const documents = await client.fetch(ORDERS_QUERY, {from, to})
      const buffer = await buildWorkbook(documents)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `visupair-sales-register_${fromDate}_${toDate}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [client, fromDate, toDate])

  return (
    <Flex padding={4} sizing="border" justify="center">
      <Card padding={5} radius={3} shadow={1} style={{maxWidth: 560, width: '100%'}}>
        <Stack space={4}>
          <Stack space={3}>
            <Heading as="h1" size={3}>
              Sales export (tax register)
            </Heading>
            <Text muted size={1}>
              Two tabs: <strong>A4 print</strong> (compact, for printing) and <strong>All columns</strong>{' '}
              (every field + full Stripe URL). In Excel, headers show short Polish with a small English line
              underneath. Stripe cells are <strong>clickable links</strong>.
            </Text>
          </Stack>

          <Stack space={3}>
            <Text size={1} weight="semibold">
              Order date range (<code>createdAt</code>)
            </Text>
            <Flex gap={3} wrap="wrap">
              <Box flex={1} style={{minWidth: 140}}>
                <Text size={1} muted>
                  From
                </Text>
                <TextInput
                  type="date"
                  value={fromDate}
                  onChange={(ev) => setFromDate(ev.currentTarget.value)}
                />
              </Box>
              <Box flex={1} style={{minWidth: 140}}>
                <Text size={1} muted>
                  To
                </Text>
                <TextInput
                  type="date"
                  value={toDate}
                  onChange={(ev) => setToDate(ev.currentTarget.value)}
                />
              </Box>
            </Flex>
          </Stack>

          {error ? (
            <Card tone="critical" padding={3} radius={2}>
              <Text size={1}>{error}</Text>
            </Card>
          ) : null}

          <Button
            icon={DownloadIcon}
            text={busy ? 'Building…' : 'Download Excel'}
            tone="primary"
            disabled={busy || !fromDate || !toDate}
            onClick={download}
          />
        </Stack>
      </Card>
    </Flex>
  )
}
