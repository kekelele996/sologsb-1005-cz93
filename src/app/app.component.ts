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
import type { Annotation, CaseSummary, Claim, Feature, PendingSupport, Role, ValidationIssue, WorkbenchState } from './models'
import { WorkbenchService } from './workbench.service'

interface SplitMessage {
  severity: 'success' | 'warning' | 'error'
  text: string
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  cases: CaseSummary[] = []
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  splitDialog = false
  splitName = ''
  splitClaimIds: string[] = []
  simulateHandoffFailure = false
  splitMessage: SplitMessage | null = null
  activeIssue: ValidationIssue | null = null
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
    this.cases = []
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
    }))
    this.subscriptions.add(this.service.cases$.subscribe(cases => this.cases = cases))
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
  get isParent(): boolean { return this.state.caseKind === 'parent' }
  get isDivisional(): boolean { return this.state.caseKind === 'divisional' }
  get caseOptions(): Array<{ label: string; value: string }> {
    return this.cases.map(record => ({ label: `${record.kind === 'parent' ? '母案' : '分案'} · ${record.name}`, value: record.id }))
  }
  get handoffFailed(): boolean { return this.state.handoffStatus === 'failed' }
  get pendingSupports(): PendingSupport[] { return this.state.pendingSupports }
  get unresolvedSupportCount(): number { return this.pendingSupports.filter(item => item.status === 'pending').length }
  get confirmedSupportCount(): number { return this.pendingSupports.filter(item => item.status === 'confirmed').length }
  get rejectedSupportCount(): number { return this.pendingSupports.filter(item => item.status === 'rejected').length }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }
  caseKindLabel(record: CaseSummary): string { return record.kind === 'parent' ? '母案' : '分案' }
  caseName(recordId: string): string { return this.cases.find(record => record.id === recordId)?.name || recordId }
  pendingFeature(pending: PendingSupport): Feature | undefined { return this.state.features.find(feature => feature.id === pending.featureId) }
  pendingCount(feature: Feature): number { return this.pendingSupports.filter(item => item.featureId === feature.id && item.status === 'pending').length }
  pendingTarget(pending: PendingSupport) { return this.state.paragraphs.find(paragraph => paragraph.id === (pending.targetParagraphId || '')) }
  targetOptions(pending: PendingSupport) {
    const normalized = pending.sourceText.replace(/\s+/g, '').trim()
    return this.state.paragraphs.filter(paragraph => paragraph.text.replace(/\s+/g, '').trim() === normalized)
  }
  splitClaimTitle(id: string): string { return this.state.splitPackage?.claims.find(claim => claim.id === id)?.title || id }

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
    this.splitName = `分案 ${new Date().toLocaleDateString('zh-CN')}`
    this.splitClaimIds = this.state.selectedClaimId ? [this.state.selectedClaimId] : this.state.claims.slice(0, 1).map(claim => claim.id)
    this.simulateHandoffFailure = false
    this.splitMessage = null
    this.splitDialog = true
  }

  toggleSplitClaim(id: string, checked: boolean): void {
    this.splitClaimIds = checked
      ? Array.from(new Set([...this.splitClaimIds, id]))
      : this.splitClaimIds.filter(item => item !== id)
  }

  submitSplit(): void {
    const result = this.service.createDivisionalSplit(this.splitName, this.splitClaimIds, this.simulateHandoffFailure)
    this.splitMessage = { severity: result.ok ? 'success' : 'warning', text: result.message }
    this.splitDialog = false
  }

  retryHandoff(): void {
    const result = this.service.retryHandoff()
    this.splitMessage = { severity: result.ok ? 'success' : 'error', text: result.message }
  }

  setPendingTarget(pending: PendingSupport, event: Event): void {
    const targetId = (event.target as HTMLSelectElement).value || null
    this.service.setPendingTarget(pending.id, targetId)
  }

  confirmPending(pending: PendingSupport): void {
    const target = this.state.paragraphs.find(paragraph => paragraph.id === pending.targetParagraphId)
    if (!target || target.text.replace(/\s+/g, '').trim() !== pending.sourceText.replace(/\s+/g, '').trim()) {
      this.splitMessage = { severity: 'error', text: '只能确认正文完全一致的分案段落；编号不一致不会自动继承映射。' }
      return
    }
    this.splitMessage = null
    this.service.confirmPendingSupport(pending.id, target.id)
  }

  rejectPending(id: string): void { this.service.rejectPendingSupport(id) }
  reopenPending(id: string): void { this.service.reopenPendingSupport(id) }

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
    anchor.download = `${this.state.caseKind}-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab(issue.type === 'pending-support' ? 'reconciliation' : 'mapping')
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
