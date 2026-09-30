import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CardModule } from 'primeng/card'
import { BadgeModule } from 'primeng/badge'
import { DialogModule } from 'primeng/dialog'
import { TooltipModule } from 'primeng/tooltip'
import { Subscription } from 'rxjs'
import type { Annotation, Claim, DivisionalCase, Feature, PendingBasis, Role, ValidationIssue, WorkbenchState } from './models'
import { WorkbenchService } from './workbench.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  activeIssue: ValidationIssue | null = null
  splitDialogVisible = false
  splitSelectedIds = new Set<string>()
  splitResult: { kind: 'duplicate'; existingId: string } | null = null
  reconcileMessage = ''
  repointTargets: Record<string, string> = {}
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
    }))
    this.subscriptions.add(this.service.issues$.subscribe(issues => this.issues = issues))
    this.subscriptions.add(this.service.history$.subscribe(history => this.history = history))
    window.addEventListener('keydown', this.handleKeyboard)
  }

  ngAfterViewInit(): void {
    const position = this.service.readPosition()
    setTimeout(() => window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior }), 0)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyboard)
  }

  get selectedClaim(): Claim | undefined { return this.state.claims.find(item => item.id === this.state.selectedClaimId) }
  get selectedFeature(): Feature | undefined { return this.state.features.find(item => item.id === this.state.selectedFeatureId) }
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId) }
  get featureAnnotations(): Annotation[] { return this.selectedFeature ? this.state.annotations.filter(item => item.featureId === this.selectedFeature?.id) : [] }
  get currentRoleLabel(): string { return this.roleOptions.find(item => item.value === this.state.role)?.label || '' }
  get errorCount(): number { return this.issues.filter(item => item.severity === 'error').length }
  get warningCount(): number { return this.issues.filter(item => item.severity === 'warning').length }
  get canEditMainData(): boolean { return this.state.role !== 'viewer' }
  get mappedFeatureCount(): number { return this.claimFeatures.filter(feature => feature.supportIds.length > 0).length }
  get isDivisional(): boolean { return this.state.activeCaseId !== 'parent' }
  get activeDivisional(): DivisionalCase | undefined { return this.state.divisionalCases.find(item => item.id === this.state.activeCaseId) }
  get parentCaseName(): string { return '母案 CN-2026-0917' }
  get pendingBasisItems(): PendingBasis[] { return this.activeDivisional?.pendingBasis.filter(item => item.status === 'pending') || [] }
  get resolvedBasisItems(): PendingBasis[] { return this.activeDivisional?.pendingBasis.filter(item => item.status !== 'pending') || [] }
  get matchedBasisRows(): Array<{ featureLabel: string; sections: string[] }> {
    if (!this.activeDivisional) return []
    return this.activeDivisional.slice.features.map(feature => ({
      featureLabel: feature.label,
      sections: feature.supportIds.map(id => this.paragraphLabel(id))
    }))
  }
  get splitSummary(): { claims: number; features: number; paragraphs: number; annotations: number } {
    const parent = this.state.parentSlice
    const selected = new Set(this.splitSelectedIds)
    const featureIdSet = new Set(parent.features.filter(feature => selected.has(feature.claimId)).map(feature => feature.id))
    let grew = true
    while (grew) {
      grew = false
      for (const feature of parent.features) {
        if (!featureIdSet.has(feature.id)) continue
        for (const ref of [feature.parentId, ...feature.referenceIds].filter((value): value is string => !!value)) {
          if (!featureIdSet.has(ref)) { featureIdSet.add(ref); grew = true }
        }
      }
    }
    const claimIds = new Set(parent.features.filter(feature => featureIdSet.has(feature.id)).map(feature => feature.claimId))
    return {
      claims: claimIds.size,
      features: featureIdSet.size,
      paragraphs: parent.paragraphs.length,
      annotations: parent.annotations.filter(annotation => featureIdSet.has(annotation.featureId)).length
    }
  }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }

  updateClaimField(field: 'title' | 'text' | 'number' | 'independent', event: Event): void {
    const element = event.target as HTMLInputElement
    const value = field === 'number' ? Number(element.value) : field === 'independent' ? element.checked : element.value
    this.service.updateClaim({ [field]: value })
  }

  updateFeatureField(field: 'label' | 'text', event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
  }

  updateFeatureParent(event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { parentId: (event.target as HTMLSelectElement).value || null })
  }

  toggleReference(featureId: string, checked: boolean): void {
    if (!this.selectedFeature) return
    const ids = checked
      ? Array.from(new Set([...this.selectedFeature.referenceIds, featureId]))
      : this.selectedFeature.referenceIds.filter(id => id !== featureId)
    this.service.updateFeature(this.selectedFeature.id, { referenceIds: ids })
  }

  addAnnotation(): void {
    if (!this.selectedFeature) return
    this.service.addAnnotation(this.selectedFeature.id, this.annotationDraft)
    this.annotationDraft = ''
  }

  updateAnnotation(annotation: Annotation, event: Event): void {
    this.service.updateAnnotation(annotation.id, (event.target as HTMLTextAreaElement).value)
  }

  createVersion(): void {
    this.service.createVersion(this.versionName)
    this.versionName = ''
    this.versionDialog = false
  }

  restoreVersion(id: string): void {
    this.service.restoreVersion(id)
  }

  openSplitDialog(): void {
    this.splitResult = null
    this.reconcileMessage = ''
    this.splitSelectedIds = new Set(this.state.parentSlice.claims.map(claim => claim.id))
    this.splitDialogVisible = true
  }

  toggleSplitClaim(id: string, checked: boolean): void {
    if (checked) this.splitSelectedIds.add(id)
    else this.splitSelectedIds.delete(id)
  }

  confirmSplit(): void {
    if (!this.splitSelectedIds.size) return
    const result = this.service.createDivisional(Array.from(this.splitSelectedIds))
    if (!result.ok && result.reason === 'duplicate') {
      this.splitResult = { kind: 'duplicate', existingId: result.existingId! }
      return
    }
    this.splitDialogVisible = false
  }

  openDivisional(id: string): void {
    this.service.activateCase(id)
    this.splitDialogVisible = false
  }

  openParent(): void {
    this.service.activateCase('parent')
  }

  divisionalName(id: string): string {
    return this.state.divisionalCases.find(item => item.id === id)?.name || '分案'
  }

  retryHandoff(): void {
    if (!this.isDivisional) return
    this.service.retryHandoff(this.state.activeCaseId)
  }

  reconcileNow(): void {
    const result = this.service.reconcileDivisional()
    this.reconcileMessage = result.pending
      ? `对账完成：${result.pending} 项依据已退回待确认，等待重新指向或丢弃。`
      : '对账完成：分案说明书依据与母案全部匹配。'
  }

  resolvePending(item: PendingBasis, action: 'repoint' | 'discard'): void {
    const target = this.repointTargets[item.id]
    this.service.resolvePendingBasis(item.id, action, action === 'repoint' ? target : undefined)
    delete this.repointTargets[item.id]
  }

  getVersion(id: string) { return this.state.versions.find(item => item.id === id) }
  compareRows(): Array<{ label: string; before: string; after: string; changed: boolean }> {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const ids = Array.from(new Set([...a.claims.map(item => item.id), ...b.claims.map(item => item.id)]))
    return ids.map(id => {
      const before = a.claims.find(item => item.id === id)?.text || ''
      const after = b.claims.find(item => item.id === id)?.text || ''
      return { label: `权利要求 ${a.claims.find(item => item.id === id)?.number || b.claims.find(item => item.id === id)?.number || '?'}`, before, after, changed: before !== after }
    })
  }

  exportFile(type: 'json' | 'csv'): void {
    const content = type === 'json' ? this.service.exportJson() : this.service.exportCsv()
    const mime = type === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `patent-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab('mapping')
  }

  closeIssue(): void { this.activeIssue = null }

  private syncVersions(): void {
    if (!this.state.versions.some(item => item.id === this.compareA)) this.compareA = this.state.versions[1]?.id || this.state.versions[0]?.id || ''
    if (!this.state.versions.some(item => item.id === this.compareB)) this.compareB = this.state.versions[0]?.id || ''
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.service.redo() : this.service.undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.service.redo()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.versionDialog = true
    }
  }
}
