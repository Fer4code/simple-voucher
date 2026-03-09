import { useState, useMemo } from 'react'

/**
 * Format an ISO/DB timestamp to Caracas timezone display
 */
function formatCaracas(dateStr) {
    if (!dateStr) return '—'
    try {
        // The backend already stores in Caracas time, just format it nicely
        const parts = dateStr.split(' ')
        if (parts.length === 2) {
            const [datePart, timePart] = parts
            const [y, m, d] = datePart.split('-')
            return `${d}/${m}/${y} ${timePart}`
        }
        return dateStr
    } catch {
        return dateStr
    }
}

function getStatus(voucher) {
    if (voucher.used_at) return 'used'
    if (voucher.requested_at) return 'requested'
    return 'available'
}

function getStatusLabel(status) {
    switch (status) {
        case 'used': return 'Usado'
        case 'requested': return 'Solicitado'
        case 'available': return 'Disponible'
        default: return status
    }
}

export default function VoucherTable({ vouchers }) {
    const [sortField, setSortField] = useState('id')
    const [sortDir, setSortDir] = useState('asc')

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('asc')
        }
    }

    const sorted = useMemo(() => {
        return [...vouchers].sort((a, b) => {
            let aVal = a[sortField]
            let bVal = b[sortField]

            // Handle nulls — push them to the end
            if (aVal == null && bVal == null) return 0
            if (aVal == null) return 1
            if (bVal == null) return -1

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase()
                bVal = (bVal || '').toLowerCase()
            }

            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    }, [vouchers, sortField, sortDir])

    const thClass = (field) => {
        if (sortField !== field) return ''
        return sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc'
    }

    if (vouchers.length === 0) {
        return (
            <div className="empty-state">
                <p>No hay vouchers cargados. Use el script <code>seed.js</code> para importar.</p>
            </div>
        )
    }

    return (
        <div className="table-wrapper">
            <table className="voucher-table" id="voucher-table">
                <thead>
                    <tr>
                        <th className={thClass('code')} onClick={() => handleSort('code')}>
                            Código
                        </th>
                        <th className={thClass('requested_by')} onClick={() => handleSort('requested_by')}>
                            Vendedor
                        </th>
                        <th className={thClass('requested_at')} onClick={() => handleSort('requested_at')}>
                            Solicitado
                        </th>
                        <th className={thClass('used_at')} onClick={() => handleSort('used_at')}>
                            Primer Uso
                        </th>
                        <th className={thClass('mac_address')} onClick={() => handleSort('mac_address')}>
                            MAC Address
                        </th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(v => {
                        const status = getStatus(v)
                        return (
                            <tr key={v.id}>
                                <td>
                                    <span className="voucher-code">{v.code}</span>
                                </td>
                                <td>{v.requested_by || '—'}</td>
                                <td>{formatCaracas(v.requested_at)}</td>
                                <td>{formatCaracas(v.used_at)}</td>
                                <td>
                                    {v.mac_address
                                        ? <span className="mac-address">{v.mac_address}</span>
                                        : '—'
                                    }
                                </td>
                                <td>
                                    <span className={`badge badge-${status}`}>
                                        {getStatusLabel(status)}
                                    </span>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
