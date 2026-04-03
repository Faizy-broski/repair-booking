'use client'
import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Tag, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'

interface AttributeValue { id: string; value: string; display_order: number }
interface Attribute {
  id: string; name: string; is_default: boolean; display_order: number
  product_attribute_values: AttributeValue[]
}

export default function ProductAttributesPage() {
  const [attributes, setAttributes]       = useState<Attribute[]>([])
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({})

  // Create/Edit attribute modal
  const [attrModal, setAttrModal]         = useState(false)
  const [editAttr, setEditAttr]           = useState<Attribute | null>(null)
  const [attrName, setAttrName]           = useState('')
  const [attrSaving, setAttrSaving]       = useState(false)

  // Delete attribute confirm
  const [deleteAttr, setDeleteAttr]       = useState<Attribute | null>(null)

  // Add value inline
  const [addingValueFor, setAddingValueFor] = useState<string | null>(null)
  const [newValueText, setNewValueText]     = useState('')

  async function fetchAttributes() {
    setLoading(true)
    const res  = await fetch('/api/product-attributes')
    const json = await res.json()
    setAttributes(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAttributes() }, [])

  function openCreate() {
    setEditAttr(null)
    setAttrName('')
    setAttrModal(true)
  }

  function openEdit(a: Attribute) {
    setEditAttr(a)
    setAttrName(a.name)
    setAttrModal(true)
  }

  async function saveAttribute() {
    if (!attrName.trim()) return
    setAttrSaving(true)
    if (editAttr) {
      await fetch(`/api/product-attributes/${editAttr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: attrName.trim() }),
      })
    } else {
      await fetch('/api/product-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: attrName.trim() }),
      })
    }
    setAttrSaving(false)
    setAttrModal(false)
    fetchAttributes()
  }

  async function confirmDeleteAttr() {
    if (!deleteAttr) return
    await fetch(`/api/product-attributes/${deleteAttr.id}`, { method: 'DELETE' })
    setDeleteAttr(null)
    fetchAttributes()
  }

  async function addValue(attributeId: string) {
    if (!newValueText.trim()) return
    await fetch(`/api/product-attributes/${attributeId}/values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newValueText.trim() }),
    })
    setAddingValueFor(null)
    setNewValueText('')
    fetchAttributes()
  }

  async function deleteValue(valueId: string) {
    await fetch(`/api/product-attributes/values/${valueId}`, { method: 'DELETE' })
    fetchAttributes()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Product Attributes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Define attributes like Color, Size, or Storage to create product variants.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Attribute
        </Button>
      </div>

      {/* Attribute list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : attributes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Tag className="mx-auto h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No attributes yet</p>
          <p className="text-xs text-gray-400 mt-1">Add attributes to create product variants</p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add First Attribute
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {attributes.map(attr => {
            const isExpanded = expanded[attr.id] ?? true
            const vals = attr.product_attribute_values
            return (
              <div key={attr.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Attribute header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleExpand(attr.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{attr.name}</span>
                      {attr.is_default && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                      <span className="text-xs text-gray-400">
                        {vals.length} {vals.length === 1 ? 'value' : 'values'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setAddingValueFor(attr.id); setNewValueText(''); setExpanded(p => ({ ...p, [attr.id]: true })) }}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                      title="Add value"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(attr)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Rename attribute"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteAttr(attr)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                      title="Delete attribute"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Values section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {vals.length === 0 && addingValueFor !== attr.id && (
                        <span className="text-xs text-gray-400 italic">No values yet — click + to add</span>
                      )}
                      {vals.map(v => (
                        <span
                          key={v.id}
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
                        >
                          {v.value}
                          <button
                            onClick={() => deleteValue(v.id)}
                            className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Inline add value */}
                    {addingValueFor === attr.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          autoFocus
                          placeholder="Enter value (e.g. Black)"
                          value={newValueText}
                          onChange={e => setNewValueText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') addValue(attr.id)
                            if (e.key === 'Escape') { setAddingValueFor(null); setNewValueText('') }
                          }}
                          className="h-8 text-sm w-48"
                        />
                        <Button size="sm" onClick={() => addValue(attr.id)} disabled={!newValueText.trim()}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddingValueFor(null); setNewValueText('') }}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit attribute modal */}
      <Modal
        open={attrModal}
        onClose={() => setAttrModal(false)}
        title={editAttr ? 'Edit Attribute' : 'New Attribute'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attribute Name</label>
            <Input
              autoFocus
              placeholder="e.g. Color, Size, Storage"
              value={attrName}
              onChange={e => setAttrName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAttribute() }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAttrModal(false)}>Cancel</Button>
            <Button onClick={saveAttribute} disabled={attrSaving || !attrName.trim()}>
              {attrSaving ? 'Saving…' : editAttr ? 'Save Changes' : 'Create Attribute'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!deleteAttr}
        onClose={() => setDeleteAttr(null)}
        title="Delete Attribute"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteAttr?.name}</strong>?
            This will also remove all its values and may affect existing product variants.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteAttr(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteAttr}>Delete Attribute</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
